package org.iinicia.app.data.local

import kotlinx.serialization.KSerializer
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonElement
import org.iinicia.app.core.common.Fetched
import org.iinicia.app.core.storage.KeyValueStore

/**
 * Última copia de los datos académicos, en el almacén cifrado, para mostrarla sin conexión.
 * Se borra junto con la sesión (AuthManager vacía el almacén al cerrar o al vencer la sesión).
 */
class OfflineCache(
    private val store: KeyValueStore,
    private val json: Json,
    private val clock: () -> Long = System::currentTimeMillis,
) {
    @Serializable
    private class Entry(val savedAt: Long, val data: JsonElement)

    fun <T> save(key: String, serializer: KSerializer<T>, value: T) {
        val entry = Entry(clock(), json.encodeToJsonElement(serializer, value))
        store.put(PREFIX + key, json.encodeToString(Entry.serializer(), entry))
    }

    fun <T> load(key: String, serializer: KSerializer<T>): Fetched<T>? {
        val text = store.get(PREFIX + key) ?: return null
        return runCatching {
            val entry = json.decodeFromString(Entry.serializer(), text)
            Fetched(json.decodeFromJsonElement(serializer, entry.data), entry.savedAt)
        }.getOrNull()
    }

    private companion object {
        const val PREFIX = "cache_"
    }
}
