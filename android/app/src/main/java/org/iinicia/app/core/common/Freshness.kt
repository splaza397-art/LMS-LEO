package org.iinicia.app.core.common

/**
 * Antigüedad de los datos de una pantalla (Fase 4.10, hallazgo A17). Al volver del segundo plano o al regresar a
 * una pestaña, la pantalla se actualiza solo si sus datos tienen más de maxAgeMs: no hay consultas continuas ni
 * solicitudes duplicadas al abrirla.
 */
class Freshness(
    private val maxAgeMs: Long = 60_000,
    private val clock: () -> Long = System::currentTimeMillis,
) {
    private var loadedAt: Long? = null

    fun markLoaded() {
        loadedAt = clock()
    }

    /** Sin una carga correcta todavía no se considera vieja: la carga inicial ya está en curso. */
    fun isStale(): Boolean = loadedAt?.let { clock() - it >= maxAgeMs } ?: false
}
