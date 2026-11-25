package org.iinicia.app.features.notifications

import android.content.Context

/** Programa la revisión de avisos en segundo plano. La interfaz y los ViewModels no tocan WorkManager directamente. */
interface NoticeScheduler {
    fun schedule()
    fun checkNow()
    fun cancel()
}

class WorkManagerNoticeScheduler(private val context: Context) : NoticeScheduler {
    override fun schedule() = NoticeWorker.schedule(context)
    override fun checkNow() = NoticeWorker.checkNow(context)
    override fun cancel() {
        NoticeWorker.cancel(context)
    }
}
