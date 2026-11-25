package org.iinicia.app.di

import android.content.Context
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.flow.filter
import kotlinx.coroutines.flow.launchIn
import kotlinx.coroutines.flow.onEach
import org.iinicia.app.BuildConfig
import org.iinicia.app.core.network.ApiClient
import org.iinicia.app.core.network.AppJson
import org.iinicia.app.core.security.AuthManager
import org.iinicia.app.core.security.Authenticator
import org.iinicia.app.core.storage.KeyValueStore
import org.iinicia.app.core.storage.SecureStore
import org.iinicia.app.data.local.OfflineCache
import org.iinicia.app.data.remote.HttpIiniciaApi
import org.iinicia.app.data.remote.IiniciaApi
import org.iinicia.app.data.repositories.CourseRepository
import org.iinicia.app.data.repositories.NotificationRepository
import org.iinicia.app.data.repositories.ProfileRepository
import org.iinicia.app.data.repositories.SettingsRepository
import org.iinicia.app.features.notifications.NoticeScheduler
import org.iinicia.app.features.notifications.WorkManagerNoticeScheduler

/**
 * Dependencias de la app (inyección manual, sin Hilt: son pocas piezas).
 * El constructor recibe las fronteras con el exterior (sesión, API, almacén, programador de avisos), así que las
 * pruebas arman la app completa con dobles. create() arma la versión real.
 */
class AppContainer(
    val auth: Authenticator,
    api: IiniciaApi,
    store: KeyValueStore,
    val scheduler: NoticeScheduler,
) {
    private val cache = OfflineCache(store, AppJson, owner = { auth.userId })
    val profiles = ProfileRepository(api, cache)
    val courses = CourseRepository(api, cache)
    val notices = NotificationRepository(api, cache)
    val settings = SettingsRepository(store)

    init {
        OfflineCache.LEGACY_KEYS.forEach { store.put(it, null) }
        // Al cerrar o vencer la sesión se olvida lo que hay en memoria: la siguiente cuenta no ve datos de la anterior.
        auth.signedIn.filter { !it }.onEach { clearUserData() }.launchIn(CoroutineScope(SupervisorJob() + Dispatchers.Default))
    }

    fun clearUserData() {
        profiles.clear()
        courses.clear()
        notices.clear()
    }

    companion object {
        fun create(context: Context): AppContainer {
            require(BuildConfig.API_URL.startsWith("https://") || (BuildConfig.ALLOW_HTTP && BuildConfig.API_URL.startsWith("http://localhost:"))) {
                "La API debe usar HTTPS; HTTP solo hacia localhost en debug"
            }
            val store = SecureStore(context)
            val auth = AuthManager(context, store)
            return AppContainer(auth, HttpIiniciaApi(ApiClient(auth, BuildConfig.API_URL)), store, WorkManagerNoticeScheduler(context))
        }
    }
}
