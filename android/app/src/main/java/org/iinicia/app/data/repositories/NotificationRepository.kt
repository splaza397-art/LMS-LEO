package org.iinicia.app.data.repositories

import kotlinx.serialization.builtins.ListSerializer
import org.iinicia.app.core.common.Fetched
import org.iinicia.app.core.common.SharedValue
import org.iinicia.app.data.local.OfflineCache
import org.iinicia.app.data.models.Notice
import org.iinicia.app.data.remote.IiniciaApi

/** Avisos del portal: los muestra la pestaña Avisos y los revisa el worker en segundo plano. */
class NotificationRepository(private val api: IiniciaApi, private val cache: OfflineCache) {
    private val shared = SharedValue(owner = cache::currentOwner) { networkFirst(cache, "notices", ListSerializer(Notice.serializer())) { api.notifications() } }

    suspend fun notices(force: Boolean = false): Fetched<List<Notice>> = shared.get(force)

    /** Solo red: el worker no debe notificar avisos viejos de la caché. */
    suspend fun fetchFromServer(): List<Notice> = api.notifications()

    /** Marca como leído y vuelve a pedir solo los avisos (antes se recargaba todo el tablero). */
    suspend fun markRead(id: String): Fetched<List<Notice>> {
        api.markRead(id)
        return shared.get(force = true)
    }

    fun clear() = shared.clear()
}
