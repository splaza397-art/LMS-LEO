package org.iinicia.app.data.repositories

import kotlinx.serialization.builtins.ListSerializer
import org.iinicia.app.core.common.Fetched
import org.iinicia.app.core.common.SharedValue
import org.iinicia.app.data.local.OfflineCache
import org.iinicia.app.data.models.Activity
import org.iinicia.app.data.models.Course
import org.iinicia.app.data.remote.IiniciaApi

/** Cursos y actividades. Moodle es la fuente: el backend los consulta y la app solo los muestra. */
class CourseRepository(
    private val api: IiniciaApi,
    private val cache: OfflineCache,
    private val campus: CampusLinks = CampusLinks(api),
) {
    private val courses = SharedValue(owner = cache::currentOwner) { networkFirst(cache, "courses", ListSerializer(Course.serializer())) { api.courses() } }
    private val upcoming = SharedValue(owner = cache::currentOwner) { networkFirst(cache, "upcoming", ListSerializer(Activity.serializer())) { api.upcoming() } }

    suspend fun courses(force: Boolean = false): Fetched<List<Course>> = courses.get(force)

    suspend fun upcoming(force: Boolean = false): Fetched<List<Activity>> = upcoming.get(force)

    suspend fun course(id: Int): Fetched<Course> = networkFirst(cache, "course_$id", Course.serializer()) { api.course(id) }

    /** Paso 1 de la entrada al campus (ver CampusLinks): enlace al paso de vinculación de Moodle. */
    suspend fun campusLink(courseId: Int? = null, cmid: Int? = null): String = campus.start(courseId, cmid)

    /** Paso 2: comprobante vinculado al navegador, solo si la vuelta desde Moodle corresponde al paso 1. */
    suspend fun campusTicket(callback: CampusCallback): String = campus.complete(callback)

    fun clear() {
        courses.clear()
        upcoming.clear()
    }
}
