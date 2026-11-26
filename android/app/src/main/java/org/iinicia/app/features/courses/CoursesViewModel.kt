package org.iinicia.app.features.courses

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import org.iinicia.app.core.common.Freshness
import org.iinicia.app.core.common.ScreenState
import org.iinicia.app.core.common.loadFrom
import org.iinicia.app.core.security.Session
import org.iinicia.app.data.models.Course
import org.iinicia.app.data.repositories.CourseRepository

class CoursesViewModel(
    private val courses: CourseRepository,
    private val session: Session,
    private val clock: () -> Long = System::currentTimeMillis,
) : ViewModel() {
    private val _state = MutableStateFlow(ScreenState<List<Course>>())
    val state: StateFlow<ScreenState<List<Course>>> = _state.asStateFlow()
    private var loading: Job? = null
    private val freshness = Freshness(clock = clock)

    init { refresh(force = false) }

    fun refresh(force: Boolean = true) {
        loading?.cancel()
        loading = viewModelScope.launch {
            _state.loadFrom(session) { courses.courses(force) }
            if (_state.value.error == null && _state.value.data != null) freshness.markLoaded()
        }
    }

    /** La pantalla vuelve a estar activa: se actualiza solo si sus datos tienen más de 60 s. */
    fun onResume() {
        if (freshness.isStale()) refresh()
    }
}
