package org.iinicia.app.features.auth

import android.content.Intent
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.receiveAsFlow
import kotlinx.coroutines.launch
import org.iinicia.app.core.network.AppError
import org.iinicia.app.core.security.Authenticator
import org.iinicia.app.core.security.LoginCancelledException
import org.iinicia.app.data.remote.IiniciaApi
import org.iinicia.app.features.notifications.NoticeScheduler

/**
 * Inicio y cierre de sesión. La Activity solo lanza el intent de AppAuth y entrega el resultado aquí.
 * El cierre es coordinado con el backend (Keycloak y Moodle) y no abre el navegador (Fase 4.10).
 */
class AuthViewModel(
    private val auth: Authenticator,
    private val scheduler: NoticeScheduler,
    private val api: IiniciaApi,
) : ViewModel() {
    val signedIn: StateFlow<Boolean> = auth.signedIn

    private val _loginError = MutableStateFlow<String?>(null)
    val loginError: StateFlow<String?> = _loginError.asStateFlow()

    private val _logoutNotice = MutableStateFlow<String?>(null)

    /** Aviso en la pantalla de inicio de sesión cuando el cierre en el servidor quedó pendiente. */
    val logoutNotice: StateFlow<String?> = _logoutNotice.asStateFlow()

    private val _askNotifications = Channel<Unit>(Channel.CONFLATED)

    /** Momento de pedir el permiso de notificaciones: justo después de iniciar sesión, no al abrir la app. */
    val askNotifications: Flow<Unit> = _askNotifications.receiveAsFlow()

    init {
        // Un cierre anterior que no se pudo confirmar (sin red, servidor caído, teléfono bloqueado) se completa ahora.
        retryPendingLogout()
    }

    fun loginIntent(): Intent = auth.loginIntent()

    /** data == null: la persona cerró el navegador sin iniciar sesión; no es un error. */
    fun onLoginResult(data: Intent?) {
        if (data == null) return
        viewModelScope.launch {
            try {
                auth.completeLogin(data)
                _loginError.value = null
                scheduler.schedule()
                _askNotifications.send(Unit)
                retryPendingLogout()
            } catch (e: CancellationException) {
                throw e
            } catch (_: LoginCancelledException) {
                _loginError.value = null
            } catch (e: AppError) {
                _loginError.value = "No se pudo iniciar sesión. ${e.message}"
            } catch (_: Exception) {
                _loginError.value = "No se pudo iniciar sesión. Intenta de nuevo."
            }
        }
    }

    fun logout() {
        viewModelScope.launch {
            scheduler.cancel()
            val confirmed = auth.logout { api.logout() }
            _logoutNotice.value = if (confirmed) null else PENDING_NOTICE
        }
    }

    private fun retryPendingLogout() {
        if (!auth.logoutPending) return
        viewModelScope.launch {
            val done = auth.retryPendingLogout { token -> api.logout(bearer = token) }
            if (done && _logoutNotice.value == PENDING_NOTICE) _logoutNotice.value = null
        }
    }

    companion object {
        const val PENDING_NOTICE =
            "Cerraste sesión en este teléfono. El cierre en el servidor se completará cuando haya conexión."
    }
}
