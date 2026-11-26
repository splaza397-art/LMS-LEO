package org.iinicia.app.data.repositories

import org.iinicia.app.core.storage.KeyValueStore

/** Preferencias del dispositivo y estado del worker de avisos. Se borran al cerrar sesión, con el resto del almacén. */
class SettingsRepository(private val store: KeyValueStore) {
    var notificationsEnabled: Boolean
        get() = store.get(PREF_NOTIFICATIONS) != "off"
        set(value) = store.put(PREF_NOTIFICATIONS, if (value) "on" else "off")

    var lastNotifiedId: String?
        get() = store.get(PREF_LAST_NOTICE)
        set(value) = store.put(PREF_LAST_NOTICE, value)

    private companion object {
        const val PREF_NOTIFICATIONS = "pref_notifications"
        const val PREF_LAST_NOTICE = "last_notice"
    }
}
