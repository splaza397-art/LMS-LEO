package org.iinicia.app.data

import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.async
import kotlinx.coroutines.test.runTest
import kotlinx.serialization.builtins.ListSerializer
import kotlinx.serialization.builtins.serializer
import org.iinicia.app.core.common.Fetched
import org.iinicia.app.core.common.SharedValue
import org.iinicia.app.core.network.AppError
import org.iinicia.app.core.network.AppJson
import org.iinicia.app.core.storage.MemoryStore
import org.iinicia.app.data.local.OfflineCache
import org.iinicia.app.data.repositories.CourseRepository
import org.iinicia.app.data.repositories.NotificationRepository
import org.iinicia.app.data.repositories.SettingsRepository
import org.iinicia.app.testing.FakeApi
import org.iinicia.app.testing.Sample
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Assert.fail
import org.junit.Test
import java.util.concurrent.TimeUnit

class SharedValueTest {
    private var now = 1_000L
    private var loads = 0
    private fun value(result: () -> Fetched<String> = { Fetched("dato") }) = SharedValue(maxAgeMs = 30_000, clock = { now }) { loads++; result() }

    @Test fun `reutiliza un valor reciente y vuelve a pedir si se fuerza o si caduco`() = runTest {
        val shared = value()
        shared.get(); shared.get()
        assertEquals(1, loads)
        shared.get(force = true)
        assertEquals(2, loads)
        now += 31_000
        shared.get()
        assertEquals(3, loads)
    }

    @Test fun `las llamadas simultaneas comparten una sola carga`() = runTest {
        val gate = CompletableDeferred<Unit>()
        val shared = SharedValue(clock = { now }) { loads++; gate.await(); Fetched("dato") }
        val first = async { shared.get(force = true) }
        val second = async { shared.get(force = true) }
        testScheduler.advanceUntilIdle()
        gate.complete(Unit)
        assertEquals("dato", first.await().data)
        assertEquals("dato", second.await().data)
        assertEquals(1, loads)
    }

    @Test fun `un valor de la cache nunca cuenta como reciente`() = runTest {
        val shared = value { Fetched("viejo", savedAt = 1L) }
        shared.get(); shared.get()
        assertEquals(2, loads)
    }

    @Test fun `nunca reutiliza el valor de otra persona`() = runTest {
        var who = "persona-a"
        val shared = SharedValue(clock = { now }, owner = { who }) { loads++; Fetched("de $who") }
        shared.get()
        who = "persona-b"
        assertEquals("de persona-b", shared.get().data)
        assertEquals(2, loads)
    }

    @Test fun `clear olvida el valor`() = runTest {
        val shared = value()
        shared.get()
        shared.clear()
        assertNull(shared.state.value)
        shared.get()
        assertEquals(2, loads)
    }
}

class OfflineCacheTest {
    private val store = MemoryStore()
    private var owner: String? = "persona-a"
    private var now = 1_000_000L
    private val cache = OfflineCache(store, AppJson, owner = { owner }, clock = { now })
    private val list = ListSerializer(String.serializer())

    @Test fun `guarda y lee con la fecha de la copia`() {
        cache.save("k", list, listOf("a", "b"))
        val read = cache.load("k", list)!!
        assertEquals(listOf("a", "b"), read.data)
        assertEquals(1_000_000L, read.savedAt)
    }

    @Test fun `otra cuenta nunca ve la copia y la copia se borra`() {
        cache.save("k", list, listOf("de A"))
        owner = "persona-b"
        assertNull(cache.load("k", list))
        owner = "persona-a"
        assertNull(cache.load("k", list))
    }

    @Test fun `caduca a los 7 dias`() {
        cache.save("k", list, listOf("x"))
        now += TimeUnit.DAYS.toMillis(7)
        assertEquals(listOf("x"), cache.load("k", list)?.data)
        now += 1
        assertNull(cache.load("k", list))
    }

    @Test fun `sin persona identificada no guarda nada`() {
        owner = null
        cache.save("k", list, listOf("x"))
        assertNull(store.get("cache_k"))
    }

    @Test fun `una copia danada o del formato anterior se ignora`() {
        store.put("cache_k", "[\"formato anterior\"]")
        assertNull(cache.load("k", list))
        assertNull(store.get("cache_k"))
    }
}

class RepositoryTest {
    private val api = FakeApi()
    private val store = MemoryStore()
    private val cache = OfflineCache(store, AppJson, owner = { "persona-a" })
    private val courses = CourseRepository(api, cache)

    @Test fun `con red guarda la copia y si Moodle no responde usa la copia con su fecha`() = runTest {
        assertEquals(null, courses.courses().savedAt)
        api.onCourses = { throw AppError.CampusUnavailable() }
        val offline = courses.courses(force = true)
        assertEquals(listOf(Sample.course()), offline.data)
        assertTrue(offline.fromCache)
    }

    @Test fun `un error definitivo no se oculta con datos guardados`() = runTest {
        courses.courses()
        api.onCourses = { throw AppError.Forbidden() }
        try {
            courses.courses(force = true)
            fail("Debió propagar el 403")
        } catch (_: AppError.Forbidden) {
        }
    }

    @Test fun `sin copia, el error pasajero se propaga`() = runTest {
        api.onCourse = { throw AppError.Timeout() }
        try {
            courses.course(99)
            fail("Debió propagar el tiempo agotado")
        } catch (_: AppError.Timeout) {
        }
    }

    @Test fun `Inicio y Cursos comparten una sola solicitud`() = runTest {
        courses.courses()
        courses.courses()
        assertEquals(1, api.count("courses"))
    }

    @Test fun `enlace al campus para el curso o para una actividad`() = runTest {
        courses.campusLink(courseId = 7)
        courses.campusLink(cmid = 11)
        assertEquals(listOf("campusLink/7/null", "campusLink/null/11"), api.calls)
    }

    @Test fun `marcar como leido pide solo los avisos, una vez`() = runTest {
        val notices = NotificationRepository(api, cache)
        notices.notices()
        notices.markRead("n1")
        assertEquals(listOf("notifications", "markRead/n1", "notifications"), api.calls)
    }

    @Test fun `si marcar como leido falla no se reintenta`() = runTest {
        val notices = NotificationRepository(api, cache)
        api.onMarkRead = { throw AppError.Server() }
        runCatching { notices.markRead("n1") }
        assertEquals(1, api.count("markRead/n1"))
    }

    @Test fun `preferencias`() {
        val settings = SettingsRepository(store)
        assertTrue(settings.notificationsEnabled)
        settings.notificationsEnabled = false
        assertEquals(false, settings.notificationsEnabled)
        settings.lastNotifiedId = "n9"
        assertEquals("n9", settings.lastNotifiedId)
    }
}
