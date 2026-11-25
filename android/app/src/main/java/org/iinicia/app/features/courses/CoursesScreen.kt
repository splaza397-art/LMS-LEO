package org.iinicia.app.features.courses

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import org.iinicia.app.data.models.Course
import org.iinicia.app.ui.components.EmptyState
import org.iinicia.app.ui.components.ScreenContent

@Composable
fun CoursesScreen(viewModel: CoursesViewModel, open: (Int, String?) -> Unit) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    ScreenContent(state, onRefresh = viewModel::refresh) { courses -> CourseList(courses, open) }
}

@Composable
fun CourseList(courses: List<Course>, open: (Int, String?) -> Unit) {
    if (courses.isEmpty()) return EmptyState("Aún no tienes cursos asignados.")
    LazyColumn(Modifier.fillMaxSize(), contentPadding = PaddingValues(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        items(courses, key = { it.id }) { CourseCard(it, open) }
    }
}
