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
import androidx.activity.viewModels
import androidx.browser.customtabs.CustomTabsIntent
import androidx.core.net.toUri
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.lifecycleScope
import androidx.lifecycle.repeatOnLifecycle
import androidx.lifecycle.viewmodel.initializer
import androidx.lifecycle.viewmodel.viewModelFactory
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.launch
import org.iinicia.app.features.auth.AuthViewModel
import org.iinicia.app.features.notifications.canPostNotifications
import org.iinicia.app.navigation.AppRoot
import org.iinicia.app.ui.theme.IiniciaTheme

/** Solo inicializa y presenta la app: lanza los intents de AppAuth y Custom Tabs, y recibe los deep links. */
class MainActivity : ComponentActivity() {
    private val container get() = (application as IiniciaApp).container
    private val auth: AuthViewModel by viewModels {
        viewModelFactory { initializer { AuthViewModel(container.auth, container.scheduler, container.api) } }
    }
    private val deepLink = MutableStateFlow<Uri?>(null)

    private val loginLauncher = registerForActivityResult(ActivityResultContracts.StartActivityForResult()) { auth.onLoginResult(it.data) }
    private val permission = registerForActivityResult(ActivityResultContracts.RequestPermission()) { granted ->
        if (granted) container.scheduler.checkNow()
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        enableEdgeToEdge(statusBarStyle = SystemBarStyle.dark(android.graphics.Color.TRANSPARENT))
        super.onCreate(savedInstanceState)
        deepLink.value = intent?.data
        if (container.auth.signedIn.value) container.scheduler.schedule()
        lifecycleScope.launch {
            repeatOnLifecycle(Lifecycle.State.STARTED) {
                launch { auth.askNotifications.collect { requestNotificationPermission() } }
            }
        }
        setContent {
            IiniciaTheme {
                AppRoot(
                    container = container,
                    auth = auth,
                    deepLink = deepLink,
                    onLogin = { loginLauncher.launch(auth.loginIntent()) },
                    onOpenUrl = { url -> CustomTabsIntent.Builder().build().launchUrl(this, url.toUri()) },
                    onEnableNotifications = ::requestNotificationPermission,
                )
            }
        }
    }

    /** Android 13+: pide el permiso solo si falta. En versiones anteriores no existe y no hay nada que pedir. */
    private fun requestNotificationPermission() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU && !canPostNotifications(this)) {
            permission.launch(Manifest.permission.POST_NOTIFICATIONS)
        }
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        deepLink.value = intent.data
    }
}
