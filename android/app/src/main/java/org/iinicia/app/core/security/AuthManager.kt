package org.iinicia.app.core.security

import android.content.Context
import android.content.Intent
import android.net.Uri
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
import net.openid.appauth.EndSessionRequest
import net.openid.appauth.ResponseTypeValues
import net.openid.appauth.connectivity.ConnectionBuilder
import org.iinicia.app.BuildConfig
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

    private val config = AuthorizationServiceConfiguration(
        Uri.parse("${BuildConfig.ISSUER_URL}/protocol/openid-connect/auth"),
        Uri.parse("${BuildConfig.ISSUER_URL}/protocol/openid-connect/token"),
        null,
        Uri.parse("${BuildConfig.ISSUER_URL}/protocol/openid-connect/logout"),
    )

    override fun loginIntent(): Intent = service.getAuthorizationRequestIntent(
        AuthorizationRequest.Builder(config, CLIENT_ID, ResponseTypeValues.CODE, Uri.parse(REDIRECT))
            .setScope("openid profile email offline_access")
            .setUiLocales("es")
            .build(),
    )

    override suspend fun completeLogin(data: Intent) = mutex.withLock {
        val response = AuthorizationResponse.fromIntent(data)
        val error = AuthorizationException.fromIntent(data)
        if (response == null) throw error ?: IllegalStateException("Inicio de sesión cancelado")
        val fresh = AuthState(response, error)
        val tokens = suspendCancellableCoroutine { cont ->
            service.performTokenRequest(response.createTokenExchangeRequest()) { result, ex ->
                if (result != null) cont.resume(result) else cont.resumeWithException(ex ?: IllegalStateException("Sin tokens"))
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
                clearLocked()
                throw SessionExpiredException()
            }
            throw error
        }
    }

    override suspend fun logoutIntent(): Intent? = mutex.withLock {
        val idToken = state.idToken
        state.refreshToken?.let { revoke(it) }
        clearLocked()
        idToken?.let {
            service.getEndSessionRequestIntent(
                EndSessionRequest.Builder(config)
                    .setIdTokenHint(it)
                    .setPostLogoutRedirectUri(Uri.parse(LOGOUT_REDIRECT))
                    .build(),
            )
        }
    }

    /** La sesion offline sobrevive al cierre en el navegador: se revoca explicitamente en el servidor. */
    private suspend fun revoke(refreshToken: String) = withContext(Dispatchers.IO) {
        runCatching {
            val uri = Uri.parse("${BuildConfig.ISSUER_URL}/protocol/openid-connect/revoke")
            val connection = (if (BuildConfig.ALLOW_HTTP) LocalhostConnectionBuilder.openConnection(uri) else URL(uri.toString()).openConnection() as HttpURLConnection)
            connection.requestMethod = "POST"
            connection.doOutput = true
            connection.setRequestProperty("Content-Type", "application/x-www-form-urlencoded")
            val body = "client_id=$CLIENT_ID&token_type_hint=refresh_token&token=${URLEncoder.encode(refreshToken, "UTF-8")}"
            connection.outputStream.use { it.write(body.toByteArray()) }
            connection.responseCode
            connection.disconnect()
        }
    }

    override suspend fun clearSession() = mutex.withLock { clearLocked() }

    private fun clearLocked() {
        state = AuthState()
        store.clear()
        _signedIn.value = false
    }

    private fun persist() = store.put(KEY, state.jsonSerializeString())

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
        const val LOGOUT_REDIRECT = "org.iinicia.app:/logout"
    }
}
