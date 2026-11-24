package org.iinicia.app.ui

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.launch
import org.iinicia.app.IiniciaApp
import org.iinicia.app.auth.SessionExpiredException
import org.iinicia.app.data.ApiException
import org.iinicia.app.data.Course
import org.iinicia.app.data.Dashboard
import java.io.IOException

data class UiState<T>(val loading: Boolean = true, val data: T? = null, val offline: Boolean = false, val error: String? = null)

private fun friendly(error: Throwable) = when (error) {
    is ApiException -> error.message ?: "Ocurrió un error"
    is IOException -> "Sin conexión. Revisa tu internet e intenta de nuevo."
    else -> "Ocurrió un error inesperado"
}

class DashboardViewModel(private val app: IiniciaApp) : ViewModel() {
    private val _state = MutableStateFlow(UiState<Dashboard>())
    val state: StateFlow<UiState<Dashboard>> = _state
    val message = MutableStateFlow<String?>(null)

    init { refresh() }

    fun refresh() = viewModelScope.launch {
        _state.value = _state.value.copy(loading = true, error = null)
        try {
            val (data, offline) = app.repository.dashboard()
            _state.value = UiState(loading = false, data = data, offline = offline)
        } catch (e: CancellationException) {
            throw e
        } catch (e: SessionExpiredException) {
            app.auth.clearSession()
        } catch (e: Exception) {
            _state.value = _state.value.copy(loading = false, error = friendly(e))
        }
    }

    fun markRead(id: String) = viewModelScope.launch {
        runCatching { app.repository.markRead(id) }.onSuccess { refresh() }
    }

    fun openCampus(courseId: Int? = null, cmid: Int? = null, open: (String) -> Unit) = viewModelScope.launch {
        try {
            open(app.repository.campusLink(courseId, cmid))
        } catch (e: CancellationException) {
            throw e
        } catch (e: SessionExpiredException) {
            app.auth.clearSession()
        } catch (e: Exception) {
            message.value = friendly(e)
        }
    }
}

class CourseViewModel(private val app: IiniciaApp, private val courseId: Int) : ViewModel() {
    private val _state = MutableStateFlow(UiState<Course>())
    val state: StateFlow<UiState<Course>> = _state

    init { refresh() }

    fun refresh() = viewModelScope.launch {
        _state.value = _state.value.copy(loading = true, error = null)
        try {
            val (data, offline) = app.repository.course(courseId)
            _state.value = UiState(loading = false, data = data, offline = offline)
        } catch (e: CancellationException) {
            throw e
        } catch (e: SessionExpiredException) {
            app.auth.clearSession()
        } catch (e: Exception) {
            _state.value = _state.value.copy(loading = false, error = friendly(e))
        }
    }
}
