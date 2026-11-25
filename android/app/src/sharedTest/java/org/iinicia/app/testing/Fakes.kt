package org.iinicia.app.testing

import android.content.Intent
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import org.iinicia.app.core.security.Authenticator
import org.iinicia.app.data.models.Activity
import org.iinicia.app.data.models.Course
import org.iinicia.app.data.models.Notice
import org.iinicia.app.data.models.Profile
import org.iinicia.app.data.models.Section
import org.iinicia.app.data.remote.IiniciaApi
import org.iinicia.app.features.notifications.NoticeScheduler

/**
 * Datos ficticios para las pruebas. Ninguna persona, correo ni curso real: dominios .test y nombres inventados.
 */
object Sample {
    fun profile(first: String = "Ana", last: String = "Prueba", campus: Boolean = true) = Profile(
        id = "u-$first",
        email = "${first.lowercase()}.${last.lowercase()}@ejemplo.test",
        firstName = first,
        lastName = last,
        status = if (campus) "activo" else "aspirante",
        roles = listOf(if (campus) "estudiante" else "aspirante"),
        permissions = if (campus) listOf("campus:access") else emptyList(),
    )

    fun activity(cmid: Int = 11, courseId: Int = 7, completed: Boolean = false) = Activity(
        cmid = cmid, name = "Tarea ficticia $cmid", modname = "assign", duedate = 1_900_000_000L,
        completed = completed, courseId = courseId, courseName = "Curso Ficticio",
    )

    fun course(id: Int = 7, progress: Int = 40) = Course(
        id = id, fullname = "Curso Ficticio", shortname = "CF-$id", summary = "Resumen de prueba.",
        progress = progress, activityCount = 2,
        sections = listOf(Section(1, "Unidad 1", listOf(activity(11, id), activity(12, id, completed = true)))),
    )

    fun notice(id: String = "n1", read: Boolean = false) = Notice(
        id = id, title = "Aviso de prueba $id", body = "Contenido ficticio.", readAt = if (read) "2026-01-01T00:00:00Z" else null,
        createdAt = "2026-01-01T00:00:00Z",
    )
}

/** Sesión controlada por la prueba. Nunca contiene un token real. */
class FakeAuthenticator(signedIn: Boolean = true, var user: String = "persona-a") : Authenticator {
    val state = MutableStateFlow(signedIn)
    override val signedIn: StateFlow<Boolean> = state
    override val userId: String? get() = user.takeIf { state.value }

    var tokenError: Exception? = null
    var tokenRequests = 0
    var clearCalls = 0
    var logoutCalls = 0
    var loginBehavior: suspend () -> Unit = {}

    override suspend fun accessToken(): String {
        tokenRequests++
        tokenError?.let { throw it }
        return "token-de-prueba"
    }

    override suspend fun clearSession() {
        clearCalls++
        state.value = false
    }

    override fun loginIntent(): Intent = Intent()

    override suspend fun completeLogin(data: Intent) {
        loginBehavior()
        state.value = true
    }

    /** Refresh token pendiente (como el que guarda AuthManager si el servidor no confirmó el cierre). */
    var pending: String? = null
    var retryCalls = 0
    /** Respuesta de Keycloak al renovar con el token pendiente: null = sin red, "gone" = la sesión ya no existe. */
    var pendingRefresh: String? = "token-de-acceso-pendiente"

    override suspend fun logout(remoteLogout: suspend () -> Boolean): Boolean {
        logoutCalls++
        val confirmed = state.value && runCatching { remoteLogout() }.getOrDefault(false)
        state.value = false
        if (!confirmed) pending = "refresh-pendiente"
        return confirmed
    }

    override val logoutPending: Boolean get() = pending != null

    override suspend fun retryPendingLogout(remoteLogout: suspend (accessToken: String) -> Boolean): Boolean {
        retryCalls++
        if (pending == null) return true
        return when (val access = pendingRefresh) {
            null -> false
            "gone" -> { pending = null; true }
            else -> {
                val ok = runCatching { remoteLogout(access) }.getOrDefault(false)
                if (ok) pending = null
                ok
            }
        }
    }
}

/** API con respuestas controladas. Cada respuesta es una función: puede devolver datos, lanzar un error o esperar. */
class FakeApi : IiniciaApi {
    val calls = mutableListOf<String>()
    var onMe: suspend () -> Profile = { Sample.profile() }
    var onCourses: suspend () -> List<Course> = { listOf(Sample.course()) }
    var onCourse: suspend (Int) -> Course = { Sample.course(it) }
    var onUpcoming: suspend () -> List<Activity> = { listOf(Sample.activity()) }
    var onNotifications: suspend () -> List<Notice> = { listOf(Sample.notice("n1"), Sample.notice("n2", read = true)) }
    var onMarkRead: suspend (String) -> Unit = {}
    /** Cierre en el servidor: true = Keycloak y Moodle confirmaron. Guarda el token explícito usado. */
    var onLogout: suspend (String?) -> Boolean = { true }
    val logoutBearers = mutableListOf<String?>()
    var onCampusLink: suspend (Int?, Int?) -> String = { courseId, cmid -> "https://campus.ejemplo.test/sso?course=$courseId&cmid=$cmid" }

    fun count(call: String) = calls.count { it == call }

    override suspend fun me(): Profile { calls.add("me"); return onMe() }
    override suspend fun courses(): List<Course> { calls.add("courses"); return onCourses() }
    override suspend fun course(id: Int): Course { calls.add("course/$id"); return onCourse(id) }
    override suspend fun upcoming(): List<Activity> { calls.add("upcoming"); return onUpcoming() }
    override suspend fun notifications(): List<Notice> { calls.add("notifications"); return onNotifications() }
    override suspend fun markRead(id: String) { calls.add("markRead/$id"); onMarkRead(id) }
    override suspend fun logout(bearer: String?): Boolean { calls.add("logout"); logoutBearers.add(bearer); return onLogout(bearer) }
    override suspend fun campusLink(courseId: Int?, cmid: Int?): String { calls.add("campusLink/$courseId/$cmid"); return onCampusLink(courseId, cmid) }
}

class FakeScheduler : NoticeScheduler {
    var scheduled = 0
    var checks = 0
    var cancelled = 0
    override fun schedule() { scheduled++ }
    override fun checkNow() { checks++ }
    override fun cancel() { cancelled++ }
}
