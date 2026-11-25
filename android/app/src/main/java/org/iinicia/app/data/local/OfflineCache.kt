package org.iinicia.app.data.local

import kotlinx.serialization.KSerializer
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonElement
import org.iinicia.app.core.common.Fetched
import org.iinicia.app.core.storage.KeyValueStore
import java.util.concurrent.TimeUnit

/**
 * Última copia de los datos académicos, en el almacén cifrado, para mostrarla sin conexión. Reglas:
 * - Cada copia guarda de quién es (owner); otra cuenta nunca la ve, aunque no se hubiera borrado.
 * - Caduca a los 7 días: después se borra en vez de mostrar información vieja.
 * - Sin persona identificada no se guarda nada.
 * - Además, todo el almacén se vacía al cerrar o vencer la sesión (AuthManager).
 */
class OfflineCache(
    private val store: KeyValueStore,
    private val json: Json,
    private val owner: () -> String?,
    private val clock: () -> Long = System::currentTimeMillis,
    private val maxAgeMs: Long = TimeUnit.DAYS.toMillis(7),
) {
    @Serializable
    private class Entry(val owner: String, val savedAt: Long, val data: JsonElement)

    fun <T> save(key: String, serializer: KSerializer<T>, value: T) {
        val who = owner() ?: return
        val entry = Entry(who, clock(), json.encodeToJsonElement(serializer, value))
        store.put(PREFIX + key, json.encodeToString(Entry.serializer(), entry))
    }

    fun <T> load(key: String, serializer: KSerializer<T>): Fetched<T>? {
        val text = store.get(PREFIX + key) ?: return null
        val entry = runCatching { json.decodeFromString(Entry.serializer(), text) }.getOrNull()
        val usable = entry != null && entry.owner == owner() && clock() - entry.savedAt in 0..maxAgeMs
        if (!usable) {
            store.put(PREFIX + key, null)
            return null
        }
        return runCatching { Fetched(json.decodeFromJsonElement(serializer, entry.data), entry.savedAt) }.getOrNull()
    }

    companion object {
        private const val PREFIX = "cache_"

        /** Claves de la versión anterior (sin dueño ni fecha), que ya no se leen. */
        val LEGACY_KEYS = listOf("cache_dashboard")
    }
}
