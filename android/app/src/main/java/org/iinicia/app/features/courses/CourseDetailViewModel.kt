package org.iinicia.app.features.courses

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Job
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.receiveAsFlow
import kotlinx.coroutines.launch
import org.iinicia.app.core.common.ScreenState
import org.iinicia.app.core.common.UiEvent
import org.iinicia.app.core.common.friendlyMessage
import org.iinicia.app.core.common.loadFrom
import org.iinicia.app.core.security.Session
import org.iinicia.app.core.security.SessionExpiredException
import org.iinicia.app.data.models.Course
import org.iinicia.app.data.repositories.CourseRepository

class CourseDetailViewModel(
    private val courseId: Int,
    private val courses: CourseRepository,
    private val session: Session,
) : ViewModel() {
    private val _state = MutableStateFlow(ScreenState<Course>())
    val state: StateFlow<ScreenState<Course>> = _state.asStateFlow()
    private val _events = Channel<UiEvent>(Channel.BUFFERED)
    val events: Flow<UiEvent> = _events.receiveAsFlow()
    private var loading: Job? = null

    init { refresh() }

    fun refresh() {
        loading?.cancel()
        loading = viewModelScope.launch { _state.loadFrom(session) { courses.course(courseId) } }
    }

    /** Abre el curso (cmid == null) o una de sus actividades en Moodle, con inicio de sesión único. */
    fun openInCampus(cmid: Int? = null) {
        viewModelScope.launch {
            _events.send(campusEvent(session) { courses.campusLink(courseId = courseId.takeIf { cmid == null }, cmid = cmid) })
        }
    }
}

/** Pide el enlace al campus y lo convierte en un evento: abrir la URL o explicar por qué no se pudo. */
internal suspend fun campusEvent(session: Session, link: suspend () -> String): UiEvent = try {
    UiEvent.OpenUrl(link())
} catch (e: CancellationException) {
    throw e
} catch (_: SessionExpiredException) {
    session.clearSession()
    UiEvent.Message("Tu sesión terminó. Inicia sesión de nuevo.")
} catch (e: Exception) {
    UiEvent.Message(friendlyMessage(e))
}
