package org.iinicia.app.ui.components

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.flow.Flow
import org.iinicia.app.core.common.ScreenState
import org.iinicia.app.core.common.UiEvent

/**
 * Contenido de una pantalla según su estado: indicador mientras carga por primera vez, error con "Reintentar" si
 * no hay datos, o los datos con "deslizar para actualizar", aviso sin conexión y el error de la última actualización.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun <T> ScreenContent(state: ScreenState<T>, onRefresh: () -> Unit, content: @Composable (T) -> Unit) {
    val data = state.data
    when {
        data != null -> PullToRefreshBox(isRefreshing = state.loading, onRefresh = onRefresh, modifier = Modifier.fillMaxSize()) {
            Column {
                if (state.offline) OfflineBanner()
                state.error?.let { Text(it, color = MaterialTheme.colorScheme.error, modifier = Modifier.padding(16.dp)) }
                content(data)
            }
        }
        state.loading -> Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) { CircularProgressIndicator() }
        else -> Column(
            Modifier.fillMaxSize().padding(24.dp),
            verticalArrangement = Arrangement.Center,
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            Text(state.error ?: "No se pudo cargar")
            Spacer(Modifier.height(12.dp))
            Button(onClick = onRefresh) { Text("Reintentar") }
        }
    }
}

@Composable
fun OfflineBanner() = Surface(color = Color(0xFFFEF3C7), modifier = Modifier.fillMaxWidth()) {
    Text("Sin conexión. Mostrando la última información guardada.", color = Color(0xFF78350F), modifier = Modifier.padding(12.dp))
}

@Composable
fun EmptyState(text: String) = Box(Modifier.fillMaxSize().padding(24.dp), contentAlignment = Alignment.Center) { Text(text) }

@Composable
fun SectionTitle(text: String) = Text(
    text,
    style = MaterialTheme.typography.titleLarge,
    fontWeight = FontWeight.Bold,
    modifier = Modifier.semantics { heading() }.padding(vertical = 8.dp),
)

/** Atiende los eventos de un ViewModel: abre enlaces o muestra mensajes en la barra inferior. */
@Composable
fun EventEffect(events: Flow<UiEvent>, snackbar: SnackbarHostState, onOpenUrl: (String) -> Unit) {
    LaunchedEffect(events) {
        events.collect { event ->
            when (event) {
                is UiEvent.OpenUrl -> onOpenUrl(event.url)
                is UiEvent.Message -> snackbar.showSnackbar(event.text)
            }
        }
    }
}
