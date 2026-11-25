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
import org.iinicia.app.features.notifications.NoticeScheduler

/** Inicio y cierre de sesión. La Activity solo lanza los intents de AppAuth y entrega los resultados aquí. */
class AuthViewModel(private val auth: Authenticator, private val scheduler: NoticeScheduler) : ViewModel() {
    val signedIn: StateFlow<Boolean> = auth.signedIn

    private val _loginError = MutableStateFlow<String?>(null)
    val loginError: StateFlow<String?> = _loginError.asStateFlow()

    private val _endSession = Channel<Intent>(Channel.BUFFERED)

    /** Intent de cierre de sesión en Keycloak que la Activity debe abrir. */
    val endSession: Flow<Intent> = _endSession.receiveAsFlow()

    fun loginIntent(): Intent = auth.loginIntent()

    /** data == null: la persona cerró el navegador sin iniciar sesión; no es un error. */
    fun onLoginResult(data: Intent?) {
        if (data == null) return
        viewModelScope.launch {
            try {
                auth.completeLogin(data)
                _loginError.value = null
                scheduler.schedule()
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
            auth.logoutIntent()?.let { _endSession.send(it) }
        }
    }
}
