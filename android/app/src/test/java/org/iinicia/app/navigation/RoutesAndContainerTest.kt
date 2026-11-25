package org.iinicia.app.navigation

import kotlinx.coroutines.test.runTest
import org.iinicia.app.core.storage.MemoryStore
import org.iinicia.app.data.models.statusLabel
import org.iinicia.app.di.AppContainer
import org.iinicia.app.testing.FakeApi
import org.iinicia.app.testing.FakeAuthenticator
import org.iinicia.app.testing.FakeScheduler
import org.iinicia.app.testing.Sample
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class RoutesTest {
    @Test fun `deep links validos`() {
        assertEquals(CourseRoute(12), deepLinkRoute("iinicia", "curso", "12"))
        assertEquals(NoticesRoute, deepLinkRoute("iinicia", "notificaciones", null))
    }

    @Test fun `deep links invalidos no navegan`() {
        assertNull(deepLinkRoute("iinicia", "curso", "abc"))
        assertNull(deepLinkRoute("iinicia", "curso", "-3"))
        assertNull(deepLinkRoute("iinicia", "curso", "0"))
        assertNull(deepLinkRoute("iinicia", "admin", "1"))
        assertNull(deepLinkRoute("https", "curso", "12"))
        assertNull(deepLinkRoute(null, null, null))
    }

    @Test fun `etiquetas de estado como en el portal`() {
        assertEquals("Activo", Sample.profile().statusLabel)
        assertEquals("Aspirante", Sample.profile(campus = false).statusLabel)
        assertEquals("otro", Sample.profile().copy(status = "otro").statusLabel)
    }
}

class AppContainerTest {
    @Test fun `al cerrar sesion se olvidan los datos en memoria y la siguiente cuenta no los ve`() = runTest {
        val auth = FakeAuthenticator()
        val api = FakeApi()
        val container = AppContainer(auth, api, MemoryStore(), FakeScheduler())
        container.profiles.load()
        assertEquals("Ana", container.profiles.profile.value?.data?.firstName)

        auth.state.value = false
        repeat(50) { if (container.profiles.profile.value != null) Thread.sleep(20) }
        assertNull(container.profiles.profile.value)

        auth.user = "persona-b"
        auth.state.value = true
        api.onMe = { Sample.profile(first = "Beto") }
        assertEquals("Beto", container.profiles.load().data.firstName)
    }

    @Test fun `las claves de la version anterior se borran al iniciar`() {
        val store = MemoryStore().apply { put("cache_dashboard", "{}") }
        AppContainer(FakeAuthenticator(), FakeApi(), store, FakeScheduler())
        assertNull(store.get("cache_dashboard"))
    }
}
