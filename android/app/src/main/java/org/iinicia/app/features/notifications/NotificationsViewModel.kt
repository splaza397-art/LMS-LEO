package org.iinicia.app.features.notifications

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
import org.iinicia.app.core.common.Freshness
import org.iinicia.app.core.common.ScreenState
import org.iinicia.app.core.common.UiEvent
import org.iinicia.app.core.common.friendlyMessage
import org.iinicia.app.core.common.loadFrom
import org.iinicia.app.core.security.Session
import org.iinicia.app.core.security.SessionExpiredException
import org.iinicia.app.data.models.Notice
import org.iinicia.app.data.repositories.NotificationRepository

class NotificationsViewModel(
    private val notices: NotificationRepository,
    private val session: Session,
    private val clock: () -> Long = System::currentTimeMillis,
) : ViewModel() {
    private val _state = MutableStateFlow(ScreenState<List<Notice>>())
    val state: StateFlow<ScreenState<List<Notice>>> = _state.asStateFlow()
    private val _events = Channel<UiEvent>(Channel.BUFFERED)
    val events: Flow<UiEvent> = _events.receiveAsFlow()
    private var loading: Job? = null
    private val freshness = Freshness(clock = clock)

    init { refresh(force = false) }

    fun refresh(force: Boolean = true) {
        loading?.cancel()
        loading = viewModelScope.launch {
            _state.loadFrom(session) { notices.notices(force) }
            if (_state.value.error == null && _state.value.data != null) freshness.markLoaded()
        }
    }

    /** Escritura: no se reintenta sola. Si falla, se avisa y el aviso queda como no leído. */
    fun markRead(id: String) {
        viewModelScope.launch {
            try {
                val updated = notices.markRead(id)
                _state.value = ScreenState(data = updated.data, loading = false, savedAt = updated.savedAt)
            } catch (e: CancellationException) {
                throw e
            } catch (_: SessionExpiredException) {
                session.clearSession()
            } catch (e: Exception) {
                _events.send(UiEvent.Message("No se pudo marcar como leído. ${friendlyMessage(e)}"))
            }
        }
    }

    /** La pantalla vuelve a estar activa: se actualiza solo si sus datos tienen más de 60 s. */
    fun onResume() {
        if (freshness.isStale()) refresh()
    }
}
