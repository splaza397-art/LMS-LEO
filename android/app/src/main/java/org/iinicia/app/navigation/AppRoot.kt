package org.iinicia.app.navigation

import android.net.Uri
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import kotlinx.coroutines.flow.MutableStateFlow
import org.iinicia.app.di.AppContainer
import org.iinicia.app.features.auth.AuthViewModel
import org.iinicia.app.features.auth.LoginScreen

/**
 * Puerta de la app: sin sesión solo existe la pantalla de inicio de sesión; con sesión, el área protegida.
 * Al cerrar o vencer la sesión, el área protegida sale de la composición completa.
 */
@Composable
fun AppRoot(
    container: AppContainer,
    auth: AuthViewModel,
    deepLink: MutableStateFlow<Uri?>,
    onLogin: () -> Unit,
    onOpenUrl: (String) -> Unit,
) {
    val signedIn by auth.signedIn.collectAsStateWithLifecycle()
    val error by auth.loginError.collectAsStateWithLifecycle()
    if (!signedIn) {
        LoginScreen(error, onLogin)
    } else {
        MainScaffold(container, deepLink, onLogout = auth::logout, onOpenUrl = onOpenUrl)
    }
}
