package org.iinicia.app.data.repositories

import kotlinx.serialization.KSerializer
import org.iinicia.app.core.common.Fetched
import org.iinicia.app.core.network.AppError
import org.iinicia.app.data.local.OfflineCache

/**
 * Red primero. Si falla por una causa transitoria (sin red, tiempo agotado, Moodle o un servicio caído), se usa la
 * última copia guardada, si existe y es de esta persona. Los errores definitivos (403, 404, 400, 429) se propagan:
 * no se oculta un "no tienes permiso" con datos viejos.
 */
internal suspend fun <T> networkFirst(cache: OfflineCache, key: String, serializer: KSerializer<T>, load: suspend () -> T): Fetched<T> =
    try {
        load().also { cache.save(key, serializer, it) }.let { Fetched(it) }
    } catch (error: AppError) {
        if (!error.transient) throw error
        cache.load(key, serializer) ?: throw error
    }
