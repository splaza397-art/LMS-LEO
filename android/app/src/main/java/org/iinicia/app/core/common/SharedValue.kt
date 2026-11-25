package org.iinicia.app.core.common

import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock

/** Datos leídos y, si salieron de la caché por no poder pedirlos, cuándo se guardaron. */
data class Fetched<out T>(val data: T, val savedAt: Long? = null) {
    val fromCache: Boolean get() = savedAt != null
}

/**
 * Un valor compartido entre pantallas (por ejemplo, los cursos en Inicio y en Cursos) que se pide una sola vez:
 * - get() reutiliza un valor reciente de la red; get(force = true) vuelve a pedirlo.
 * - Las llamadas simultáneas esperan a la primera y reciben su resultado, en vez de repetir la solicitud.
 * - Un valor salido de la caché nunca cuenta como reciente: la siguiente llamada vuelve a intentar la red.
 */
class SharedValue<T>(
    private val maxAgeMs: Long = 30_000,
    private val clock: () -> Long = System::currentTimeMillis,
    private val load: suspend () -> Fetched<T>,
) {
    private val mutex = Mutex()
    private val _state = MutableStateFlow<Fetched<T>?>(null)
    val state: StateFlow<Fetched<T>?> = _state.asStateFlow()

    @Volatile private var loadedAt = Long.MIN_VALUE

    suspend fun get(force: Boolean = false): Fetched<T> {
        val askedAt = clock()
        return mutex.withLock {
            val current = _state.value
            val reusable = current != null && !current.fromCache &&
                (loadedAt >= askedAt || (!force && clock() - loadedAt < maxAgeMs))
            if (reusable) current!! else load().also { _state.value = it; loadedAt = clock() }
        }
    }

    /** Olvida el valor (al cerrar sesión), sin esperar a una carga en curso. */
    fun clear() {
        loadedAt = Long.MIN_VALUE
        _state.value = null
    }
}
