package org.iinicia.app.features.courses

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Card
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import org.iinicia.app.core.common.formatUnixDate
import org.iinicia.app.data.models.Activity
import org.iinicia.app.data.models.Course

@Composable
fun CourseCard(course: Course, open: (Int, String?) -> Unit) {
    Card(Modifier.fillMaxWidth().clickable { open(course.id, course.fullname) }) {
        Column(Modifier.padding(16.dp)) {
            Text(course.shortname, style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.primary)
            Text(course.fullname, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold)
            Text("${course.activityCount} actividades", style = MaterialTheme.typography.bodySmall)
            if (course.progress >= 0) {
                Spacer(Modifier.height(8.dp))
                LinearProgressIndicator(progress = { course.progress / 100f }, modifier = Modifier.fillMaxWidth())
                Text("${course.progress}% completado", style = MaterialTheme.typography.bodySmall)
            }
        }
    }
}

@Composable
fun UpcomingCard(activity: Activity, openCourse: (Int, String?) -> Unit) {
    Card(Modifier.fillMaxWidth().clickable(enabled = activity.courseId != null) { activity.courseId?.let { openCourse(it, activity.courseName) } }) {
        Column(Modifier.padding(16.dp)) {
            Text(activity.name, fontWeight = FontWeight.SemiBold)
            Text("${activity.courseName ?: ""} · ${formatUnixDate(activity.duedate)}", style = MaterialTheme.typography.bodySmall)
        }
    }
}
