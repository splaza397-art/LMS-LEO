package org.iinicia.app

import android.Manifest
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.SystemBarStyle
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.activity.result.contract.ActivityResultContracts
import androidx.browser.customtabs.CustomTabsIntent
import androidx.lifecycle.lifecycleScope
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.launch
import org.iinicia.app.notifications.NoticeWorker
import org.iinicia.app.ui.AppRoot
import org.iinicia.app.ui.theme.IiniciaTheme

class MainActivity : ComponentActivity() {
    private val deepLink = MutableStateFlow<Uri?>(null)
    private val loginError = MutableStateFlow<String?>(null)
    private val app get() = application as IiniciaApp

    private val loginLauncher = registerForActivityResult(ActivityResultContracts.StartActivityForResult()) { result ->
        val data = result.data ?: return@registerForActivityResult
        lifecycleScope.launch {
            runCatching { app.auth.completeLogin(data) }
                .onSuccess {
                    loginError.value = null
                    NoticeWorker.schedule(this@MainActivity)
                }
                .onFailure { loginError.value = "No se pudo iniciar sesión. Intenta de nuevo." }
        }
    }
    private val logoutLauncher = registerForActivityResult(ActivityResultContracts.StartActivityForResult()) {}
    private val permission = registerForActivityResult(ActivityResultContracts.RequestPermission()) { granted ->
        if (granted) NoticeWorker.checkNow(this)
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        enableEdgeToEdge(statusBarStyle = SystemBarStyle.dark(android.graphics.Color.TRANSPARENT))
        super.onCreate(savedInstanceState)
        deepLink.value = intent?.data
        if (app.auth.signedIn.value) NoticeWorker.schedule(this)
        if (Build.VERSION.SDK_INT >= 33) permission.launch(Manifest.permission.POST_NOTIFICATIONS)
        setContent {
            IiniciaTheme {
                AppRoot(
                    app = app,
                    deepLink = deepLink,
                    loginError = loginError,
                    onLogin = { loginLauncher.launch(app.auth.loginIntent()) },
                    onLogout = {
                        lifecycleScope.launch {
                            NoticeWorker.cancel(this@MainActivity)
                            app.auth.logoutIntent()?.let(logoutLauncher::launch)
                        }
                    },
                    onOpenCampus = { url -> CustomTabsIntent.Builder().build().launchUrl(this, Uri.parse(url)) },
                )
            }
        }
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        deepLink.value = intent.data
    }
}
