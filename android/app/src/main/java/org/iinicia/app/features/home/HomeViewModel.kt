package org.iinicia.app.features.home

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.async
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.receiveAsFlow
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import org.iinicia.app.core.common.Fetched
import org.iinicia.app.core.common.ScreenState
import org.iinicia.app.core.common.UiEvent
import org.iinicia.app.core.common.loadFrom
import org.iinicia.app.core.security.Session
import org.iinicia.app.data.models.Activity
import org.iinicia.app.data.models.Course
import org.iinicia.app.data.models.Profile
import org.iinicia.app.data.repositories.CourseRepository
import org.iinicia.app.data.repositories.ProfileRepository
import org.iinicia.app.features.courses.campusEvent

data class HomeData(val profile: Profile, val courses: List<Course>, val upcoming: List<Activity>) {
    val canUseCampus: Boolean get() = "campus:access" in profile.permissions
}

class HomeViewModel(
    private val profiles: ProfileRepository,
    private val courses: CourseRepository,
    private val session: Session,
) : ViewModel() {
    private val _state = MutableStateFlow(ScreenState<HomeData>())
    val state: StateFlow<ScreenState<HomeData>> = _state.asStateFlow()
    private val _events = Channel<UiEvent>(Channel.BUFFERED)
    val events: Flow<UiEvent> = _events.receiveAsFlow()
    private var loading: Job? = null

    init { refresh(force = false) }

    /** Una actualización nueva reemplaza a la anterior: deslizar dos veces no duplica solicitudes. */
    fun refresh(force: Boolean = true) {
        loading?.cancel()
        loading = viewModelScope.launch {
            _state.loadFrom(session) {
                coroutineScope {
                    val profile = async { profiles.load(force) }
                    val list = async { courses.courses(force) }
                    val next = async { courses.upcoming(force) }
                    val parts = listOf(profile.await(), list.await(), next.await())
                    Fetched(
                        HomeData(profile.await().data, list.await().data, next.await().data),
                        parts.mapNotNull { it.savedAt }.minOrNull(),
                    )
                }
            }
        }
    }

    /** Entra al campus (página "Mis cursos" de Moodle) con inicio de sesión único. */
    fun openCampus() {
        viewModelScope.launch { _events.send(campusEvent(session) { courses.campusLink() }) }
    }
}
