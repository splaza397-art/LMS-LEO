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
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.flow.Flow
import org.iinicia.app.core.common.ScreenState
import org.iinicia.app.core.common.UiEvent
import org.iinicia.app.core.common.formatMillis
import org.iinicia.app.core.common.savedCopyNotice

/**
 * Contenido de una pantalla según su estado: indicador mientras carga por primera vez, error con "Reintentar" si
 * no hay datos, o los datos con "deslizar para actualizar", aviso sin conexión y el error de la última actualización.
 */
@Composable
fun <T> ScreenContent(state: ScreenState<T>, onRefresh: () -> Unit, content: @Composable (T) -> Unit) {
    val data = state.data
    when {
        data != null -> RefreshableContent(state.loading, state.savedAt, state.error, onRefresh) { content(data) }
        state.loading -> LoadingState()
        else -> ErrorState(state.error ?: "No se pudo cargar.", onRefresh)
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun RefreshableContent(refreshing: Boolean, savedAt: Long?, error: String?, onRefresh: () -> Unit, content: @Composable () -> Unit) {
    PullToRefreshBox(isRefreshing = refreshing, onRefresh = onRefresh, modifier = Modifier.fillMaxSize()) {
        Column {
            savedAt?.let { OfflineBanner(it) }
            error?.let { InlineError(it) }
            content()
        }
    }
}

@Composable
fun LoadingState(label: String = "Cargando") = Box(
    Modifier.fillMaxSize().semantics { liveRegion = LiveRegionMode.Polite },
    contentAlignment = Alignment.Center,
) {
    CircularProgressIndicator(Modifier.semantics { contentDescription = label })
}

@Composable
fun ErrorState(message: String, onRetry: () -> Unit) = Column(
    Modifier.fillMaxSize().padding(24.dp),
    verticalArrangement = Arrangement.Center,
    horizontalAlignment = Alignment.CenterHorizontally,
) {
    Text(message, textAlign = TextAlign.Center, modifier = Modifier.semantics { liveRegion = LiveRegionMode.Polite })
    Spacer(Modifier.height(12.dp))
    Button(onClick = onRetry) { Text("Reintentar") }
}

@Composable
fun InlineError(message: String) = Text(
    message,
    color = MaterialTheme.colorScheme.error,
    modifier = Modifier.padding(16.dp).semantics { liveRegion = LiveRegionMode.Polite },
)

/** Aviso de datos guardados, con la fecha de la copia para que se sepa qué tan vieja es. */
@Composable
fun OfflineBanner(savedAt: Long) = Surface(color = Color(0xFFFEF3C7), modifier = Modifier.fillMaxWidth()) {
    Text(
        savedCopyNotice(formatMillis(savedAt)),
        color = Color(0xFF78350F),
        modifier = Modifier.padding(12.dp),
    )
}

@Composable
fun EmptyState(text: String) = Box(Modifier.fillMaxSize().padding(24.dp), contentAlignment = Alignment.Center) {
    Text(text, textAlign = TextAlign.Center)
}

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
