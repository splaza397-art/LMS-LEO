package org.iinicia.app.core.common

/** Acciones de una sola vez que el ViewModel pide a la interfaz (no forman parte del estado). */
sealed interface UiEvent {
    data class OpenUrl(val url: String) : UiEvent
    data class Message(val text: String) : UiEvent
}
