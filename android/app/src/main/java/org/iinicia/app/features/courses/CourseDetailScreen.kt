package org.iinicia.app.features.courses

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import org.iinicia.app.core.common.formatUnixDate
import org.iinicia.app.data.models.Course
import org.iinicia.app.ui.components.ScreenContent
import org.iinicia.app.ui.components.SectionTitle

@Composable
fun CourseDetailScreen(viewModel: CourseDetailViewModel) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    ScreenContent(state, onRefresh = viewModel::refresh) { course ->
        CourseDetail(course, openCourse = { viewModel.openInCampus() }, openActivity = { viewModel.openInCampus(it) })
    }
}

@Composable
fun CourseDetail(course: Course, openCourse: () -> Unit, openActivity: (Int) -> Unit) {
    LazyColumn(Modifier.fillMaxSize(), contentPadding = PaddingValues(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
        item {
            Text(course.fullname, style = MaterialTheme.typography.headlineSmall, fontWeight = FontWeight.Bold)
            if (course.summary.isNotBlank()) Text(course.summary, modifier = Modifier.padding(top = 4.dp))
            Button(onClick = openCourse, modifier = Modifier.fillMaxWidth().padding(top = 12.dp).heightIn(min = 48.dp)) { Text("Abrir en el campus") }
        }
        course.sections.forEach { section ->
            item(key = "s${section.id}") { SectionTitle(section.name) }
            items(section.activities, key = { "a${it.cmid}" }) { activity ->
                Card(Modifier.fillMaxWidth().clickable(onClickLabel = "Abrir en el campus", role = Role.Button) { openActivity(activity.cmid) }) {
                    Row(Modifier.padding(16.dp), verticalAlignment = Alignment.CenterVertically) {
                        Column(Modifier.weight(1f)) {
                            Text(activity.name, fontWeight = FontWeight.SemiBold)
                            if (activity.duedate > 0) Text("Entrega: ${formatUnixDate(activity.duedate)}", style = MaterialTheme.typography.bodySmall)
                        }
                        if (activity.completed) Icon(Icons.Default.CheckCircle, "Completada", tint = Color(0xFF15803D))
                    }
                }
            }
        }
    }
}
