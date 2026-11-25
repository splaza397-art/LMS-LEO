package org.iinicia.app.features.notifications

import android.Manifest
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat
import androidx.work.Constraints
import androidx.work.CoroutineWorker
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.ExistingWorkPolicy
import androidx.work.NetworkType
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.WorkerParameters
import org.iinicia.app.IiniciaApp
import org.iinicia.app.MainActivity
import org.iinicia.app.R
import org.iinicia.app.core.security.SessionExpiredException
import java.util.concurrent.TimeUnit

/** Consulta avisos nuevos en segundo plano. Es el mecanismo equivalente a FCM mientras no exista proyecto Firebase. */
class NoticeWorker(context: Context, params: WorkerParameters) : CoroutineWorker(context, params) {
    override suspend fun doWork(): Result {
        val container = (applicationContext as IiniciaApp).container
        val settings = container.settings
        if (!container.auth.signedIn.value || !settings.notificationsEnabled) return Result.success()
        return try {
            val notices = container.notices.fetchFromServer()
            val last = settings.lastNotifiedId
            val fresh = if (last == null) notices.filter { it.readAt == null } else notices.takeWhile { it.id != last }.filter { it.readAt == null }
            fresh.take(5).reversed().forEach { show(it.id, it.title, it.body, it.link) }
            notices.firstOrNull()?.let { settings.lastNotifiedId = it.id }
            Result.success()
        } catch (_: SessionExpiredException) {
            Result.success()
        } catch (_: Exception) {
            Result.retry()
        }
    }

    private fun show(id: String, title: String, body: String, link: String?) {
        val granted = ContextCompat.checkSelfPermission(applicationContext, Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED
        if (!granted) return
        val target = link?.let { COURSE_LINK.find(it)?.groupValues?.get(1) }?.let { "iinicia://curso/$it" } ?: "iinicia://notificaciones"
        val intent = Intent(Intent.ACTION_VIEW, Uri.parse(target), applicationContext, MainActivity::class.java)
        val pending = PendingIntent.getActivity(applicationContext, id.hashCode(), intent, PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
        val notification = NotificationCompat.Builder(applicationContext, IiniciaApp.CHANNEL_ID)
            .setSmallIcon(R.drawable.ic_notification)
            .setContentTitle(title)
            .setContentText(body)
            .setStyle(NotificationCompat.BigTextStyle().bigText(body))
            .setContentIntent(pending)
            .setAutoCancel(true)
            .build()
        NotificationManagerCompat.from(applicationContext).notify(id.hashCode(), notification)
    }

    companion object {
        /** Enlaces del portal como /mi-iinicia/cursos/12 abren ese curso dentro de la app. */
        private val COURSE_LINK = Regex("""^/mi-iinicia/cursos/(\d+)$""")
        private val network = Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build()

        fun schedule(context: Context) {
            val manager = WorkManager.getInstance(context)
            manager.enqueueUniquePeriodicWork(
                "avisos",
                ExistingPeriodicWorkPolicy.KEEP,
                PeriodicWorkRequestBuilder<NoticeWorker>(15, TimeUnit.MINUTES).setConstraints(network).build(),
            )
            checkNow(context)
        }

        fun checkNow(context: Context) {
            WorkManager.getInstance(context).enqueueUniqueWork(
                "avisos-ahora",
                ExistingWorkPolicy.REPLACE,
                OneTimeWorkRequestBuilder<NoticeWorker>().setConstraints(network).build(),
            )
        }

        fun cancel(context: Context) = WorkManager.getInstance(context).cancelUniqueWork("avisos")
    }
}
