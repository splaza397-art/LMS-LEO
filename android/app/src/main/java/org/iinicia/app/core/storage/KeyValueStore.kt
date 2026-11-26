package org.iinicia.app.core.storage

/** Almacén de texto por clave. En la app es SecureStore (cifrado con Android Keystore); en las pruebas, un mapa. */
interface KeyValueStore {
    fun get(name: String): String?
    fun put(name: String, value: String?)
    fun clear()
}

/** Almacén en memoria para pruebas y vistas previas. */
class MemoryStore : KeyValueStore {
    private val values = mutableMapOf<String, String>()

    @Synchronized override fun get(name: String): String? = values[name]

    @Synchronized override fun put(name: String, value: String?) {
        if (value == null) values.remove(name) else values[name] = value
    }

    @Synchronized override fun clear() = values.clear()
}
