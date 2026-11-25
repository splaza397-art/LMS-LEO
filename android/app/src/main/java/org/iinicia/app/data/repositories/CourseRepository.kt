package org.iinicia.app.data.repositories

import kotlinx.serialization.builtins.ListSerializer
import org.iinicia.app.core.common.Fetched
import org.iinicia.app.core.common.SharedValue
import org.iinicia.app.data.local.OfflineCache
import org.iinicia.app.data.models.Activity
import org.iinicia.app.data.models.Course
import org.iinicia.app.data.remote.IiniciaApi

/** Cursos y actividades. Moodle es la fuente: el backend los consulta y la app solo los muestra. */
class CourseRepository(private val api: IiniciaApi, private val cache: OfflineCache) {
    private val courses = SharedValue { networkFirst(cache, "courses", ListSerializer(Course.serializer())) { api.courses() } }
    private val upcoming = SharedValue { networkFirst(cache, "upcoming", ListSerializer(Activity.serializer())) { api.upcoming() } }

    suspend fun courses(force: Boolean = false): Fetched<List<Course>> = courses.get(force)

    suspend fun upcoming(force: Boolean = false): Fetched<List<Activity>> = upcoming.get(force)

    suspend fun course(id: Int): Fetched<Course> = networkFirst(cache, "course_$id", Course.serializer()) { api.course(id) }

    suspend fun campusLink(courseId: Int? = null, cmid: Int? = null): String = api.campusLink(courseId, cmid)

    fun clear() {
        courses.clear()
        upcoming.clear()
    }
}
