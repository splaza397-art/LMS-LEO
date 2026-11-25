package org.iinicia.app.data.repositories

import kotlinx.coroutines.flow.StateFlow
import org.iinicia.app.core.common.Fetched
import org.iinicia.app.core.common.SharedValue
import org.iinicia.app.data.local.OfflineCache
import org.iinicia.app.data.models.Profile
import org.iinicia.app.data.remote.IiniciaApi

/** Perfil de la persona (GET /me): lo comparten Inicio y Perfil. */
class ProfileRepository(private val api: IiniciaApi, private val cache: OfflineCache) {
    private val shared = SharedValue(owner = cache::currentOwner) { networkFirst(cache, "profile", Profile.serializer()) { api.me() } }
    val profile: StateFlow<Fetched<Profile>?> = shared.state

    suspend fun load(force: Boolean = false): Fetched<Profile> = shared.get(force)

    fun clear() = shared.clear()
}
