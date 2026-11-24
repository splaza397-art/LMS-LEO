package org.iinicia.app.data

import kotlinx.coroutines.async
import kotlinx.coroutines.coroutineScope
import kotlinx.serialization.encodeToString
import org.iinicia.app.auth.SecureStore

/** Red primero con cache cifrada: sin conexion se muestra la ultima informacion conocida. */
class Repository(private val api: ApiClient, private val store: SecureStore) {

    suspend fun dashboard(): Pair<Dashboard, Boolean> = try {
        val data = coroutineScope {
            val profile = async { api.get<Profile>("me") }
            val courses = async { api.get<List<Course>>("me/courses") }
            val upcoming = async { api.get<List<Activity>>("me/upcoming") }
            val notices = async { api.get<List<Notice>>("me/notifications") }
            Dashboard(profile.await(), courses.await(), upcoming.await(), notices.await())
        }
        store.put(CACHE_DASHBOARD, api.json.encodeToString(data))
        data to false
    } catch (error: java.io.IOException) {
        val cached = store.get(CACHE_DASHBOARD) ?: throw error
        api.json.decodeFromString<Dashboard>(cached) to true
    }

    suspend fun course(id: Int): Pair<Course, Boolean> = try {
        val course = api.get<Course>("me/courses/$id")
        store.put("$CACHE_COURSE$id", api.json.encodeToString(course))
        course to false
    } catch (error: java.io.IOException) {
        val cached = store.get("$CACHE_COURSE$id") ?: throw error
        api.json.decodeFromString<Course>(cached) to true
    }

    suspend fun notifications(): List<Notice> = api.get("me/notifications")

    suspend fun markRead(id: String) {
        api.request("me/notifications/$id/read", "POST")
    }

    suspend fun campusLink(courseId: Int? = null, cmid: Int? = null): String {
        val query = when {
            cmid != null -> "?cmid=$cmid"
            courseId != null -> "?courseId=$courseId"
            else -> ""
        }
        return api.get<CampusLink>("me/campus-link$query").url
    }

    var notificationsEnabled: Boolean
        get() = store.get(PREF_NOTIFICATIONS) != "off"
        set(value) = store.put(PREF_NOTIFICATIONS, if (value) "on" else "off")

    var lastNotifiedId: String?
        get() = store.get(PREF_LAST_NOTICE)
        set(value) = store.put(PREF_LAST_NOTICE, value)

    private companion object {
        const val CACHE_DASHBOARD = "cache_dashboard"
        const val CACHE_COURSE = "cache_course_"
        const val PREF_NOTIFICATIONS = "pref_notifications"
        const val PREF_LAST_NOTICE = "last_notice"
    }
}
