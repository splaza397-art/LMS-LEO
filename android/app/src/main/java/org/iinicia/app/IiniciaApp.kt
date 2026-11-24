package org.iinicia.app

import android.app.Application
import android.app.NotificationChannel
import android.app.NotificationManager
import org.iinicia.app.auth.AuthManager
import org.iinicia.app.auth.SecureStore
import org.iinicia.app.data.ApiClient
import org.iinicia.app.data.Repository

class IiniciaApp : Application() {
    lateinit var store: SecureStore private set
    lateinit var auth: AuthManager private set
    lateinit var repository: Repository private set

    override fun onCreate() {
        super.onCreate()
        store = SecureStore(this)
        auth = AuthManager(this, store)
        repository = Repository(ApiClient(auth), store)
        getSystemService(NotificationManager::class.java).createNotificationChannel(
            NotificationChannel(CHANNEL_ID, "Avisos académicos", NotificationManager.IMPORTANCE_DEFAULT),
        )
    }

    companion object {
        const val CHANNEL_ID = "avisos"
    }
}
