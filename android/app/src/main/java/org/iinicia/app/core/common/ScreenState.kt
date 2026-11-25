package org.iinicia.app.core.common

import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.flow.MutableStateFlow
import org.iinicia.app.core.security.Session
import org.iinicia.app.core.security.SessionExpiredException

/** Estado inmutable de una pantalla que carga datos. savedAt != null: se muestran datos guardados (sin conexión). */
data class ScreenState<out T>(
    val data: T? = null,
    val loading: Boolean = true,
    val error: String? = null,
    val savedAt: Long? = null,
) {
    val offline: Boolean get() = savedAt != null
}

/**
 * Carga datos en el estado de una pantalla: marca la carga, guarda el resultado o un mensaje de error, y conserva
 * los datos anteriores si falla una actualización. Si la sesión venció, la cierra (la app vuelve al inicio de sesión).
 */
suspend fun <T> MutableStateFlow<ScreenState<T>>.loadFrom(session: Session, block: suspend () -> Fetched<T>) {
    value = value.copy(loading = true, error = null)
    try {
        val fetched = block()
        value = ScreenState(data = fetched.data, loading = false, savedAt = fetched.savedAt)
    } catch (e: CancellationException) {
        throw e
    } catch (_: SessionExpiredException) {
        session.clearSession()
    } catch (e: Exception) {
        value = value.copy(loading = false, error = friendlyMessage(e))
    }
}
