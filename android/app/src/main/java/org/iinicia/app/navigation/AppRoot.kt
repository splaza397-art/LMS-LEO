package org.iinicia.app.navigation

import android.net.Uri
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelStore
import androidx.lifecycle.ViewModelStoreOwner
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.LocalViewModelStoreOwner
import androidx.lifecycle.viewmodel.compose.viewModel
import kotlinx.coroutines.flow.MutableStateFlow
import org.iinicia.app.di.AppContainer
import org.iinicia.app.features.auth.AuthViewModel
import org.iinicia.app.features.auth.LoginScreen

/**
 * ViewModels de una sesión. Sobrevive a la rotación (vive en la Activity), pero se vacía al cerrar o vencer la
 * sesión: la siguiente cuenta empieza con ViewModels nuevos y nunca ve el estado de la anterior.
 */
class SessionViewModels : ViewModel() {
    var store = ViewModelStore()
        private set

    fun reset() {
        store.clear()
        store = ViewModelStore()
    }

    override fun onCleared() = store.clear()
}

/**
 * Puerta de la app: sin sesión solo existe la pantalla de inicio de sesión; con sesión, el área protegida.
 * Al cerrar o vencer la sesión, el área protegida sale de la composición y sus ViewModels se destruyen.
 */
@Composable
fun AppRoot(
    container: AppContainer,
    auth: AuthViewModel,
    deepLink: MutableStateFlow<Uri?>,
    onLogin: () -> Unit,
    onOpenUrl: (String) -> Unit,
    onEnableNotifications: () -> Unit = {},
) {
    val signedIn by auth.signedIn.collectAsStateWithLifecycle()
    val error by auth.loginError.collectAsStateWithLifecycle()
    val session: SessionViewModels = viewModel()
    LaunchedEffect(signedIn) { if (!signedIn) session.reset() }

    if (!signedIn) {
        LoginScreen(error, onLogin)
    } else {
        val store = session.store
        val owner = remember(store) { object : ViewModelStoreOwner { override val viewModelStore = store } }
        CompositionLocalProvider(LocalViewModelStoreOwner provides owner) {
            MainScaffold(container, deepLink, onLogout = auth::logout, onOpenUrl = onOpenUrl, onEnableNotifications = onEnableNotifications)
        }
    }
}
