package org.iinicia.app.data.repositories

import kotlinx.serialization.KSerializer
import org.iinicia.app.core.common.Fetched
import org.iinicia.app.data.local.OfflineCache
import java.io.IOException

/** Red primero; sin conexión, la última copia guardada (si existe). Cualquier otro error se propaga. */
internal suspend fun <T> networkFirst(cache: OfflineCache, key: String, serializer: KSerializer<T>, load: suspend () -> T): Fetched<T> =
    try {
        load().also { cache.save(key, serializer, it) }.let { Fetched(it) }
    } catch (error: IOException) {
        cache.load(key, serializer) ?: throw error
    }
