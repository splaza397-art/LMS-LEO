package org.iinicia.app.core.security

import android.content.Context
import android.content.Intent
import android.net.Uri
import androidx.core.net.toUri
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import net.openid.appauth.AppAuthConfiguration
import net.openid.appauth.AuthState
import net.openid.appauth.AuthorizationException
import net.openid.appauth.AuthorizationRequest
import net.openid.appauth.AuthorizationResponse
import net.openid.appauth.AuthorizationService
import net.openid.appauth.AuthorizationServiceConfiguration
import net.openid.appauth.GrantTypeValues
import net.openid.appauth.ResponseTypeValues
import net.openid.appauth.TokenRequest
import net.openid.appauth.connectivity.ConnectionBuilder
import org.iinicia.app.BuildConfig
import org.iinicia.app.core.network.AppError
import org.iinicia.app.core.storage.SecureStore
import java.net.HttpURLConnection
import java.net.URL
import java.net.URLEncoder
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlin.coroutines.resume
import kotlin.coroutines.resumeWithException

/** OIDC Authorization Code + PKCE en el navegador del sistema: la app nunca recibe la contraseña. */
class AuthManager(context: Context, private val store: SecureStore) : Authenticator {
    private val service: AuthorizationService = AuthorizationService(
        context,
        AppAuthConfiguration.Builder().apply {
            if (BuildConfig.ALLOW_HTTP) setConnectionBuilder(LocalhostConnectionBuilder)
        }.build(),
    )
    private val mutex = Mutex()
    private var state: AuthState = store.get(KEY)?.let { runCatching { AuthState.jsonDeserialize(it) }.getOrNull() } ?: AuthState()
    private val _signedIn = MutableStateFlow(state.isAuthorized)
    override val signedIn: StateFlow<Boolean> = _signedIn

    /** Identificador de la persona (claim sub del token de identidad); se conoce aun sin conexión. */
    override val userId: String? get() = state.parsedIdToken?.subject

    private val config = AuthorizationServiceConfiguration(
        "${BuildConfig.ISSUER_URL}/protocol/openid-connect/auth".toUri(),
        "${BuildConfig.ISSUER_URL}/protocol/openid-connect/token".toUri(),
        null,
        "${BuildConfig.ISSUER_URL}/protocol/openid-connect/logout".toUri(),
    )

    override fun loginIntent(): Intent = service.getAuthorizationRequestIntent(
        AuthorizationRequest.Builder(config, CLIENT_ID, ResponseTypeValues.CODE, REDIRECT.toUri())
            .setScope("openid profile email offline_access")
            .setUiLocales("es")
            // Fase 4.10: la app siempre pide credenciales. Una sesión de Keycloak que haya quedado en el navegador
            // (por ejemplo, tras un cierre interrumpido) nunca inicia sola la sesión de la cuenta anterior.
            .setPrompt(AuthorizationRequest.Prompt.LOGIN)
            .build(),
    )

    override suspend fun completeLogin(data: Intent) = mutex.withLock {
        // AppAuth ya validó que el parámetro state del callback corresponde a la solicitud enviada.
        val response = AuthorizationResponse.fromIntent(data)
        val error = AuthorizationException.fromIntent(data)
        if (response == null) {
            if (error == null || error == AuthorizationException.GeneralErrors.USER_CANCELED_AUTH_FLOW) throw LoginCancelledException()
            throw error.toAppErrorOr { error }
        }
        val fresh = AuthState(response, error)
        val tokens = suspendCancellableCoroutine { cont ->
            service.performTokenRequest(response.createTokenExchangeRequest()) { result, ex ->
                if (result != null) cont.resume(result) else cont.resumeWithException(ex?.toAppErrorOr { ex } ?: IllegalStateException("Sin tokens"))
            }
        }
        fresh.update(tokens, null)
        state = fresh
        persist()
        _signedIn.value = true
    }

    /** El mutex evita renovaciones simultaneas, porque Keycloak rota el refresh token. */
    override suspend fun accessToken(): String = mutex.withLock {
        if (!state.isAuthorized) throw SessionExpiredException()
        val token = suspendCancellableCoroutine { cont ->
            state.performActionWithFreshTokens(service) { access, _, ex ->
                when {
                    access != null -> cont.resume(Result.success(access))
                    else -> cont.resume(Result.failure(ex ?: SessionExpiredException()))
                }
            }
        }
        persist()
        token.getOrElse { error ->
            val ex = error as? AuthorizationException
            if (ex?.type == AuthorizationException.TYPE_OAUTH_TOKEN_ERROR) {
                // Keycloak rechazó el refresh token (vencido, revocado o sesión cerrada en otro lugar).
                clearLocked()
                throw SessionExpiredException()
            }
            // Sin red al renovar: es un error transitorio, la pantalla puede mostrar la copia guardada.
            throw ex?.toAppErrorOr { error } ?: error
        }
    }

    /**
     * Cierre de sesión coordinado (Fase 4.10), sin depender de una redirección en el navegador:
     * 1. El backend cierra la sesión de Keycloak y las de Moodle (remoteLogout, con el token vigente).
     * 2. Se revoca el refresh token en Keycloak.
     * 3. Se borra siempre la sesión local, aunque lo anterior falle.
     * Si el servidor no confirmó el cierre, se guarda (cifrado) el refresh token como cierre pendiente para
     * completarlo cuando haya conexión. Devuelve true solo si todo quedó confirmado.
     */
    override suspend fun logout(remoteLogout: suspend () -> Boolean): Boolean {
        val confirmed = _signedIn.value && runCatching { remoteLogout() }.getOrDefault(false)
        return mutex.withLock {
            val refresh = state.refreshToken
            clearLocked()
            if (confirmed) {
                // El backend ya cerró la sesión de Keycloak; revocar es solo limpieza.
                refresh?.let { revoke(it) }
            } else if (refresh != null) {
                // No se revoca todavía: si se revocara sin el backend, el reintento ya no podría pedirle que cierre
                // las sesiones de Moodle. El token queda cifrado como cierre pendiente; la sesión local ya se borró.
                store.put(PENDING_LOGOUT, refresh)
            }
            confirmed
        }
    }

    override val logoutPending: Boolean get() = store.get(PENDING_LOGOUT) != null

    /**
     * Completa un cierre pendiente: renueva con el refresh token guardado para obtener un token de acceso, pide el
     * cierre al backend y revoca. Si Keycloak ya no reconoce el token, la sesión ya no existe y no queda nada
     * pendiente en Keycloak. Devuelve true si ya no hay cierre pendiente.
     */
    override suspend fun retryPendingLogout(remoteLogout: suspend (accessToken: String) -> Boolean): Boolean = mutex.withLock {
        val pending = store.get(PENDING_LOGOUT) ?: return@withLock true
        val tokens = runCatching {
            suspendCancellableCoroutine { cont ->
                service.performTokenRequest(
                    TokenRequest.Builder(config, CLIENT_ID).setGrantType(GrantTypeValues.REFRESH_TOKEN).setRefreshToken(pending).build(),
                ) { result, ex -> if (result != null) cont.resume(result) else cont.resumeWithException(ex ?: IllegalStateException()) }
            }
        }
        val error = tokens.exceptionOrNull() as? AuthorizationException
        when {
            error?.type == AuthorizationException.TYPE_OAUTH_TOKEN_ERROR -> {
                store.put(PENDING_LOGOUT, null)
                true
            }
            tokens.isFailure -> false
            else -> {
                val fresh = tokens.getOrThrow()
                val confirmed = fresh.accessToken?.let { runCatching { remoteLogout(it) }.getOrDefault(false) } ?: false
                val newRefresh = fresh.refreshToken ?: pending
                val revoked = revoke(newRefresh)
                store.put(PENDING_LOGOUT, if (confirmed && revoked) null else newRefresh)
                confirmed && revoked
            }
        }
    }

    /** La sesión offline sobrevive a cerrar el navegador: se revoca explícitamente. true si Keycloak respondió 200. */
    private suspend fun revoke(refreshToken: String): Boolean = withContext(Dispatchers.IO) {
        runCatching {
            val uri = "${BuildConfig.ISSUER_URL}/protocol/openid-connect/revoke".toUri()
            val connection = (if (BuildConfig.ALLOW_HTTP) LocalhostConnectionBuilder.openConnection(uri) else URL(uri.toString()).openConnection() as HttpURLConnection)
            connection.requestMethod = "POST"
            connection.doOutput = true
            connection.setRequestProperty("Content-Type", "application/x-www-form-urlencoded")
            val body = "client_id=$CLIENT_ID&token_type_hint=refresh_token&token=${URLEncoder.encode(refreshToken, "UTF-8")}"
            connection.outputStream.use { it.write(body.toByteArray()) }
            val code = connection.responseCode
            connection.disconnect()
            code == 200
        }.getOrDefault(false)
    }

    override suspend fun clearSession() = mutex.withLock { clearLocked() }

    /** Borra la sesión y los datos guardados, pero conserva un cierre pendiente de la cuenta anterior. */
    private fun clearLocked() {
        val pending = store.get(PENDING_LOGOUT)
        state = AuthState()
        store.clear()
        pending?.let { store.put(PENDING_LOGOUT, it) }
        _signedIn.value = false
    }

    private fun persist() = store.put(KEY, state.jsonSerializeString())

    /** Fallas de red o del servidor de identidad como AppError; el resto se deja tal cual. */
    private inline fun AuthorizationException.toAppErrorOr(other: () -> Throwable): Throwable = when {
        this == AuthorizationException.GeneralErrors.NETWORK_ERROR -> AppError.Network()
        this == AuthorizationException.GeneralErrors.SERVER_ERROR -> AppError.ServiceUnavailable()
        else -> other()
    }

    private object LocalhostConnectionBuilder : ConnectionBuilder {
        override fun openConnection(uri: Uri): HttpURLConnection {
            require(uri.scheme == "https" || uri.host == "localhost") { "HTTP solo se permite hacia localhost" }
            return (URL(uri.toString()).openConnection() as HttpURLConnection).apply {
                connectTimeout = 15_000
                readTimeout = 15_000
                instanceFollowRedirects = false
            }
        }
    }

    private companion object {
        const val KEY = "auth_state"
        const val CLIENT_ID = "iinicia-android"
        const val REDIRECT = "org.iinicia.app:/oauth2redirect"
        const val PENDING_LOGOUT = "pending_logout"
    }
}
