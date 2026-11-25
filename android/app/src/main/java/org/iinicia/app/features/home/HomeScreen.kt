package org.iinicia.app.features.home

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.Button
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import org.iinicia.app.features.courses.CourseCard
import org.iinicia.app.features.courses.UpcomingCard
import org.iinicia.app.ui.components.ScreenContent
import org.iinicia.app.ui.components.SectionTitle

@Composable
fun HomeScreen(viewModel: HomeViewModel, openCourse: (Int) -> Unit) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    ScreenContent(state, onRefresh = viewModel::refresh) { data -> HomeContent(data, openCourse, viewModel::openCampus) }
}

@Composable
fun HomeContent(data: HomeData, openCourse: (Int) -> Unit, openCampus: () -> Unit) {
    LazyColumn(Modifier.fillMaxSize(), contentPadding = PaddingValues(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        item {
            Text("Hola, ${data.profile.firstName}", style = MaterialTheme.typography.headlineMedium, fontWeight = FontWeight.Bold)
        }
        if (data.canUseCampus) {
            item {
                Button(onClick = openCampus, modifier = Modifier.fillMaxWidth().heightIn(min = 48.dp)) { Text("Entrar al Campus") }
            }
        } else {
            item { Text("Tus cursos aparecerán aquí cuando tu solicitud sea autorizada.") }
        }
        if (data.upcoming.isNotEmpty()) {
            item { SectionTitle("Próximas actividades") }
            items(data.upcoming.take(3), key = { "u${it.cmid}" }) { UpcomingCard(it, openCourse) }
        }
        if (data.courses.isNotEmpty()) {
            item { SectionTitle("Mis cursos") }
            items(data.courses, key = { "c${it.id}" }) { CourseCard(it, openCourse) }
        }
    }
}
