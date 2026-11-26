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

/** Resultado de un intento de lectura, ya traducido para la interfaz. */
sealed interface Outcome<out T> {
    data class Ok<T>(val value: Fetched<T>) : Outcome<T>
    data class Failed(val message: String) : Outcome<Nothing>

    /** La sesión venció: ya se cerró y la app vuelve al inicio de sesión. */
    data object SessionEnded : Outcome<Nothing>
}

/** Ejecuta una lectura y clasifica el resultado. Si la sesión venció, la cierra. Nunca traga una cancelación. */
suspend fun <T> attempt(session: Session, block: suspend () -> Fetched<T>): Outcome<T> = try {
    Outcome.Ok(block())
} catch (e: CancellationException) {
    throw e
} catch (_: SessionExpiredException) {
    session.clearSession()
    Outcome.SessionEnded
} catch (e: Exception) {
    Outcome.Failed(friendlyMessage(e))
}

/**
 * Carga datos en el estado de una pantalla: marca la carga, guarda el resultado o un mensaje de error, y conserva
 * los datos anteriores si falla una actualización.
 */
suspend fun <T> MutableStateFlow<ScreenState<T>>.loadFrom(session: Session, block: suspend () -> Fetched<T>) {
    value = value.copy(loading = true, error = null)
    when (val outcome = attempt(session, block)) {
        is Outcome.Ok -> value = ScreenState(data = outcome.value.data, loading = false, savedAt = outcome.value.savedAt)
        is Outcome.Failed -> value = value.copy(loading = false, error = outcome.message)
        Outcome.SessionEnded -> value = value.copy(loading = false)
    }
}
