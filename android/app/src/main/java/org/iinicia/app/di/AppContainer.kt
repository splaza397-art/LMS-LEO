package org.iinicia.app.di

import android.content.Context
import org.iinicia.app.core.network.ApiClient
import org.iinicia.app.core.security.AuthManager
import org.iinicia.app.core.storage.SecureStore
import org.iinicia.app.data.repositories.Repository

/**
 * Dependencias de la app, creadas una sola vez en IiniciaApp (inyección manual).
 * Con tan pocas piezas no hace falta Hilt ni otra biblioteca: los ViewModels reciben lo que necesitan
 * por constructor, y las pruebas les pasan dobles.
 */
class AppContainer(context: Context) {
    val store = SecureStore(context)
    val auth = AuthManager(context, store)
    val repository = Repository(ApiClient(auth), store)
}
