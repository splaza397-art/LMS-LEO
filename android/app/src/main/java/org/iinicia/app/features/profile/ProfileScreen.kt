package org.iinicia.app.features.profile

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import org.iinicia.app.data.models.Profile
import org.iinicia.app.data.models.statusLabel
import org.iinicia.app.ui.components.ConfirmDialog
import org.iinicia.app.ui.components.ScreenContent

@Composable
fun ProfileScreen(viewModel: ProfileViewModel, onLogout: () -> Unit) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    val notifications by viewModel.notificationsEnabled.collectAsStateWithLifecycle()
    ScreenContent(state, onRefresh = viewModel::refresh) { profile ->
        ProfileContent(profile, notifications, viewModel::setNotificationsEnabled, onLogout)
    }
}

@Composable
fun ProfileContent(profile: Profile, notifications: Boolean, onNotificationsChange: (Boolean) -> Unit, onLogout: () -> Unit) {
    var confirmLogout by rememberSaveable { mutableStateOf(false) }
    if (confirmLogout) {
        ConfirmDialog(
            title = "¿Cerrar sesión?",
            text = "Se borrarán de este teléfono tus datos guardados. Para volver a entrar necesitarás tu correo y contraseña.",
            confirmLabel = "Cerrar sesión",
            onConfirm = { confirmLogout = false; onLogout() },
            onDismiss = { confirmLogout = false },
        )
    }
    Column(Modifier.fillMaxSize().padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        Text("${profile.firstName} ${profile.lastName}", style = MaterialTheme.typography.headlineSmall, fontWeight = FontWeight.Bold)
        Text(profile.email)
        Text("Estado: ${profile.statusLabel}")
        Row(Modifier.fillMaxWidth().heightIn(min = 48.dp), verticalAlignment = Alignment.CenterVertically) {
            Text("Notificaciones", Modifier.weight(1f))
            Switch(checked = notifications, onCheckedChange = onNotificationsChange)
        }
        OutlinedButton(onClick = { confirmLogout = true }, modifier = Modifier.fillMaxWidth().heightIn(min = 48.dp)) { Text("Cerrar sesión") }
    }
}
