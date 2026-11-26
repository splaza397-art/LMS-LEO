package org.iinicia.app.features.courses

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.receiveAsFlow
import kotlinx.coroutines.launch
import org.iinicia.app.core.common.UiEvent
import org.iinicia.app.core.security.Session
import org.iinicia.app.data.repositories.CampusCallback
import org.iinicia.app.data.repositories.CourseRepository

/**
 * Paso 2 de la entrada al campus (Fase 4.11): recibe la vuelta desde Moodle (iinicia://campus) y abre el enlace con
 * el comprobante vinculado al navegador, o explica por qué no se pudo. La pantalla no hace solicitudes.
 */
class CampusViewModel(private val courses: CourseRepository, private val session: Session) : ViewModel() {
    private val _events = Channel<UiEvent>(Channel.BUFFERED)
    val events: Flow<UiEvent> = _events.receiveAsFlow()

    fun complete(callback: CampusCallback) {
        viewModelScope.launch { _events.send(campusEvent(session) { courses.campusTicket(callback) }) }
    }
}
