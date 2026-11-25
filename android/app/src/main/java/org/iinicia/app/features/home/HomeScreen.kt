package org.iinicia.app.features.home

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import org.iinicia.app.features.courses.CourseCard
import org.iinicia.app.features.courses.UpcomingCard
import org.iinicia.app.ui.components.ErrorState
import org.iinicia.app.ui.components.LoadingState
import org.iinicia.app.ui.components.RefreshableContent
import org.iinicia.app.ui.components.SectionTitle

@Composable
fun HomeScreen(viewModel: HomeViewModel, openCourse: (Int, String?) -> Unit) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    HomeContent(state, onRefresh = viewModel::refresh, openCourse = openCourse, openCampus = viewModel::openCampus)
}

@Composable
fun HomeContent(state: HomeUiState, onRefresh: () -> Unit, openCourse: (Int, String?) -> Unit, openCampus: () -> Unit) {
    val profile = state.profile
    when {
        profile == null && state.loading -> return LoadingState()
        profile == null -> return ErrorState(state.error ?: "No se pudo cargar.", onRefresh)
    }
    RefreshableContent(state.loading, state.savedAt, state.error, onRefresh) {
        LazyColumn(Modifier.fillMaxSize(), contentPadding = PaddingValues(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            item {
                Text("Hola, ${profile!!.firstName}", style = MaterialTheme.typography.headlineMedium, fontWeight = FontWeight.Bold)
            }
            if (state.canUseCampus) {
                item {
                    Button(onClick = openCampus, modifier = Modifier.fillMaxWidth().heightIn(min = 48.dp)) { Text("Entrar al Campus") }
                }
            } else {
                item { Text("Tus cursos aparecerán aquí cuando tu solicitud sea autorizada.") }
            }
            state.academicError?.let { message ->
                item { AcademicUnavailable(message, onRefresh) }
            }
            if (state.upcoming.isNotEmpty()) {
                item { SectionTitle("Próximas actividades") }
                items(state.upcoming.take(3), key = { "u${it.cmid}" }) { UpcomingCard(it, openCourse) }
            }
            if (state.courses.isNotEmpty()) {
                item { SectionTitle("Mis cursos") }
                items(state.courses, key = { "c${it.id}" }) { CourseCard(it, openCourse) }
            }
        }
    }
}

/** Aviso dentro de Inicio cuando la parte académica (Moodle) no respondió; el resto de la pantalla sigue disponible. */
@Composable
private fun AcademicUnavailable(message: String, onRetry: () -> Unit) {
    Card(Modifier.fillMaxWidth()) {
        Column(Modifier.padding(16.dp)) {
            Text("No se pudieron cargar tus cursos", fontWeight = FontWeight.SemiBold)
            Text(message, style = MaterialTheme.typography.bodyMedium)
            OutlinedButton(onClick = onRetry, modifier = Modifier.padding(top = 8.dp).heightIn(min = 48.dp)) { Text("Reintentar") }
        }
    }
}
