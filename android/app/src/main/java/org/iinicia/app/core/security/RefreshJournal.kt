package org.iinicia.app.core.security

import org.iinicia.app.core.storage.KeyValueStore

/**
 * A16 (Fase 5): registro durable de una renovación de tokens en curso.
 *
 * Keycloak rota el refresh token y detecta su reutilización: si Android termina el proceso después de que Keycloak
 * entregó el token nuevo y antes de guardarlo, el token anterior ya no sirve y Keycloak invalida toda la familia
 * (comprobado en Keycloak 26.4.7: el intento con el token anterior devuelve invalid_grant y el token nuevo también deja
 * de valer). La sesión no se puede recuperar de forma segura, y tampoco queda una sesión huérfana en el servidor.
 *
 * Este registro solo permite saber, en el siguiente arranque, que la sesión se perdió por esa interrupción, para
 * explicarlo en lugar de mostrar un cierre sin motivo. Si la renovación interrumpida nunca llegó a Keycloak, el token
 * guardado sigue sirviendo y la sesión continúa sin que la persona note nada.
 */
class RefreshJournal(private val store: KeyValueStore) {
    /** Había una renovación sin terminar de un proceso anterior. */
    val interrupted: Boolean get() = store.get(KEY) != null

    fun begin() = store.put(KEY, "1")

    fun end() = store.put(KEY, null)

    companion object {
        const val KEY = "refresh_in_flight"
        const val INTERRUPTED_NOTICE =
            "Tu sesión se cerró por seguridad: la app se interrumpió mientras renovaba tu acceso. Inicia sesión de nuevo."
    }
}
