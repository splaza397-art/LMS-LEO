package org.iinicia.app.data.remote

import org.iinicia.app.core.network.ApiClient
import org.iinicia.app.data.models.Activity
import org.iinicia.app.data.models.CampusLink
import org.iinicia.app.data.models.Course
import org.iinicia.app.data.models.Notice
import org.iinicia.app.data.models.Profile
import java.net.URLEncoder

/**
 * Los endpoints de /api/v1 que usa la app (contrato de la Fase 2, sin cambios).
 * Es una interfaz para que los repositorios y ViewModels se prueben con respuestas controladas.
 */
interface IiniciaApi {
    suspend fun me(): Profile
    suspend fun courses(): List<Course>
    suspend fun course(id: Int): Course
    suspend fun upcoming(): List<Activity>
    suspend fun notifications(): List<Notice>
    suspend fun markRead(id: String)

    /** URL de inicio de sesión único en Moodle; el backend valida que el curso o la actividad sean del usuario. */
    suspend fun campusLink(courseId: Int? = null, cmid: Int? = null): String
}

class HttpIiniciaApi(private val client: ApiClient) : IiniciaApi {
    override suspend fun me(): Profile = client.get("me")
    override suspend fun courses(): List<Course> = client.get("me/courses")
    override suspend fun course(id: Int): Course = client.get("me/courses/$id")
    override suspend fun upcoming(): List<Activity> = client.get("me/upcoming")
    override suspend fun notifications(): List<Notice> = client.get("me/notifications")

    override suspend fun markRead(id: String) {
        client.request("me/notifications/${URLEncoder.encode(id, "UTF-8")}/read", "POST")
    }

    override suspend fun campusLink(courseId: Int?, cmid: Int?): String {
        val query = when {
            cmid != null -> "?cmid=$cmid"
            courseId != null -> "?courseId=$courseId"
            else -> ""
        }
        return client.get<CampusLink>("me/campus-link$query").url
    }
}
