package org.iinicia.app

import android.app.Application
import android.app.NotificationChannel
import android.app.NotificationManager
import org.iinicia.app.di.AppContainer

class IiniciaApp : Application() {
    lateinit var container: AppContainer private set

    override fun onCreate() {
        super.onCreate()
        container = AppContainer.create(this)
        getSystemService(NotificationManager::class.java).createNotificationChannel(
            NotificationChannel(CHANNEL_ID, "Avisos académicos", NotificationManager.IMPORTANCE_DEFAULT),
        )
    }

    companion object {
        const val CHANNEL_ID = "avisos"
    }
}
