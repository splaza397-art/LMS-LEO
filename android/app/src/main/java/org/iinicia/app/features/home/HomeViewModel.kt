package org.iinicia.app.features.home

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.async
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.receiveAsFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import org.iinicia.app.core.common.Freshness
import org.iinicia.app.core.common.Outcome
import org.iinicia.app.core.common.UiEvent
import org.iinicia.app.core.common.attempt
import org.iinicia.app.core.security.Session
import org.iinicia.app.data.models.Activity
import org.iinicia.app.data.models.Course
import org.iinicia.app.data.models.Profile
import org.iinicia.app.data.repositories.CourseRepository
import org.iinicia.app.data.repositories.ProfileRepository
import org.iinicia.app.features.courses.campusEvent

/**
 * Inicio. El perfil sale del portal y los cursos y actividades de Moodle: si Moodle no responde, se muestran el saludo
 * y el resto, con un aviso solo en la parte académica (antes fallaba la pantalla completa).
 */
data class HomeUiState(
    val profile: Profile? = null,
    val courses: List<Course> = emptyList(),
    val upcoming: List<Activity> = emptyList(),
    val loading: Boolean = true,
    /** No se pudo obtener el perfil ni hay copia: la pantalla no puede mostrarse. */
    val error: String? = null,
    /** Cursos o actividades no disponibles (por ejemplo, Moodle fuera de servicio). */
    val academicError: String? = null,
    /** Hora de la copia más antigua mostrada, si algo salió de la caché. */
    val savedAt: Long? = null,
) {
    val canUseCampus: Boolean get() = profile?.permissions?.contains("campus:access") == true
}

class HomeViewModel(
    private val profiles: ProfileRepository,
    private val courses: CourseRepository,
    private val session: Session,
    private val clock: () -> Long = System::currentTimeMillis,
) : ViewModel() {
    private val _state = MutableStateFlow(HomeUiState())
    val state: StateFlow<HomeUiState> = _state.asStateFlow()
    private val _events = Channel<UiEvent>(Channel.BUFFERED)
    val events: Flow<UiEvent> = _events.receiveAsFlow()
    private var loading: Job? = null
    private val freshness = Freshness(clock = clock)

    init { refresh(force = false) }

    /** Una actualización nueva reemplaza a la anterior: deslizar dos veces no duplica solicitudes. */
    fun refresh(force: Boolean = true) {
        loading?.cancel()
        loading = viewModelScope.launch {
            _state.update { it.copy(loading = true, error = null) }
            coroutineScope {
                val profile = async { attempt(session) { profiles.load(force) } }
                val list = async { attempt(session) { courses.courses(force) } }
                val next = async { attempt(session) { courses.upcoming(force) } }
                apply(profile.await(), list.await(), next.await())
                if (_state.value.error == null && _state.value.academicError == null) freshness.markLoaded()
            }
        }
    }

    private fun apply(profile: Outcome<Profile>, list: Outcome<List<Course>>, next: Outcome<List<Activity>>) {
        if (listOf(profile, list, next).any { it == Outcome.SessionEnded }) return
        val current = _state.value
        val academicFailure = listOf(list, next).filterIsInstance<Outcome.Failed>().firstOrNull()
        _state.value = HomeUiState(
            profile = (profile as? Outcome.Ok)?.value?.data ?: current.profile,
            courses = (list as? Outcome.Ok)?.value?.data ?: current.courses,
            upcoming = (next as? Outcome.Ok)?.value?.data ?: current.upcoming,
            loading = false,
            error = (profile as? Outcome.Failed)?.message,
            academicError = academicFailure?.message,
            savedAt = listOf(profile, list, next).mapNotNull { (it as? Outcome.Ok)?.value?.savedAt }.minOrNull(),
        )
    }

    /** Entra al campus (página "Mis cursos" de Moodle) con inicio de sesión único. */
    fun openCampus() {
        viewModelScope.launch { _events.send(campusEvent(session) { courses.campusLink() }) }
    }

    /** La pantalla vuelve a estar activa: se actualiza solo si sus datos tienen más de 60 s. */
    fun onResume() {
        if (freshness.isStale()) refresh()
    }
}
