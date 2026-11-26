package org.iinicia.app.features

import org.iinicia.app.core.common.Freshness
import org.iinicia.app.core.common.savedCopyNotice
import org.iinicia.app.core.network.AppError
import org.iinicia.app.core.network.AppJson
import org.iinicia.app.core.storage.MemoryStore
import org.iinicia.app.data.local.OfflineCache
import org.iinicia.app.data.repositories.CourseRepository
import org.iinicia.app.data.repositories.ProfileRepository
import org.iinicia.app.features.auth.AuthViewModel
import org.iinicia.app.features.courses.CoursesViewModel
import org.iinicia.app.features.home.HomeViewModel
import org.iinicia.app.testing.FakeApi
import org.iinicia.app.testing.FakeAuthenticator
import org.iinicia.app.testing.FakeScheduler
import org.iinicia.app.testing.MainDispatcherRule
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test

/** Fase 4.10: cierre de sesión coordinado, cierre pendiente, actualización al volver y formato de la fecha. */
class SessionIsolationTest {
    @get:Rule val main = MainDispatcherRule()

    private val api = FakeApi()
    private val session = FakeAuthenticator()
    private val scheduler = FakeScheduler()

    // --- Cierre de sesión coordinado

    @Test fun `cierre confirmado por el servidor sin aviso ni cierre pendiente`() {
        val vm = AuthViewModel(session, scheduler, api)
        vm.logout()
        assertFalse(vm.signedIn.value)
        assertEquals(listOf<String?>(null), api.logoutBearers) // con el token de la sesión vigente
        assertFalse(session.logoutPending)
        assertNull(vm.logoutNotice.value)
        assertEquals(1, scheduler.cancelled)
    }

    @Test fun `sin conexion al salir la sesion local se cierra igual y el cierre queda pendiente`() {
        api.onLogout = { throw AppError.Network() }
        val vm = AuthViewModel(session, scheduler, api)
        vm.logout()
        assertFalse(vm.signedIn.value)
        assertTrue(session.logoutPending)
        assertEquals(AuthViewModel.PENDING_NOTICE, vm.logoutNotice.value)
    }

    @Test fun `el servidor no confirma (Moodle o Keycloak caidos) y nunca se da por cerrado`() {
        api.onLogout = { false }
        val vm = AuthViewModel(session, scheduler, api)
        vm.logout()
        assertTrue(session.logoutPending)
        assertEquals(AuthViewModel.PENDING_NOTICE, vm.logoutNotice.value)
    }

    /** A16 (Fase 5): si la sesión terminó por una renovación interrumpida, la pantalla de inicio lo explica. */
    @Test fun `una renovacion interrumpida se explica al pedir credenciales`() {
        session.state.value = false
        val vm = AuthViewModel(session, scheduler, api)
        session.notice.value = org.iinicia.app.core.security.RefreshJournal.INTERRUPTED_NOTICE
        assertEquals(org.iinicia.app.core.security.RefreshJournal.INTERRUPTED_NOTICE, vm.logoutNotice.value)
    }

    @Test fun `al abrir la app se completa el cierre pendiente con su propio token`() {
        session.state.value = false
        session.pending = "refresh-pendiente"
        AuthViewModel(session, scheduler, api)
        assertEquals(listOf<String?>("token-de-acceso-pendiente"), api.logoutBearers)
        assertFalse(session.logoutPending)
    }

    @Test fun `si la sesion pendiente ya no existe en Keycloak no queda nada pendiente`() {
        session.state.value = false
        session.pending = "refresh-pendiente"
        session.pendingRefresh = "gone"
        AuthViewModel(session, scheduler, api)
        assertFalse(session.logoutPending)
        assertTrue(api.logoutBearers.isEmpty())
    }

    @Test fun `sin red el cierre sigue pendiente para el siguiente intento`() {
        session.state.value = false
        session.pending = "refresh-pendiente"
        session.pendingRefresh = null
        AuthViewModel(session, scheduler, api)
        assertTrue(session.logoutPending)
    }

    @Test fun `sin cierre pendiente no se llama al servidor al abrir la app`() {
        AuthViewModel(session, scheduler, api)
        assertEquals(0, session.retryCalls)
        assertTrue(api.logoutBearers.isEmpty())
    }

    // --- Actualización al volver del segundo plano (A17)

    @Test fun `los datos no se consideran viejos antes de cargarlos ni durante 60 s`() {
        var now = 0L
        val freshness = Freshness(clock = { now })
        assertFalse(freshness.isStale())
        freshness.markLoaded()
        now = 59_999
        assertFalse(freshness.isStale())
        now = 60_000
        assertTrue(freshness.isStale())
    }

    @Test fun `al volver a la pantalla se actualiza solo si los datos tienen mas de 60 s`() {
        var now = 0L
        val cache = OfflineCache(MemoryStore(), AppJson, owner = { session.userId })
        val vm = CoursesViewModel(CourseRepository(api, cache), session, clock = { now })
        assertEquals(1, api.count("courses"))
        vm.onResume() // al abrir la pantalla: no se repite la solicitud
        assertEquals(1, api.count("courses"))
        now = 61_000
        vm.onResume()
        assertEquals(2, api.count("courses"))
    }

    @Test fun `Inicio tambien se actualiza al volver despues de 60 s`() {
        var now = 0L
        val cache = OfflineCache(MemoryStore(), AppJson, owner = { session.userId })
        val vm = HomeViewModel(ProfileRepository(api, cache), CourseRepository(api, cache), session, clock = { now })
        assertEquals(1, api.count("me"))
        vm.onResume()
        assertEquals(1, api.count("me"))
        now = 61_000
        vm.onResume()
        assertEquals(2, api.count("me"))
    }

    // --- Formato de la fecha del aviso sin conexión

    @Test fun `la fecha que ya termina en punto no lleva un segundo punto`() {
        assertEquals("No se pudo actualizar. Mostrando la información guardada el 25 nov 2026 12:05 p. m.", savedCopyNotice("25 nov 2026 12:05 p. m."))
        assertEquals("No se pudo actualizar. Mostrando la información guardada el Nov 25, 2026 4:34 AM.", savedCopyNotice("Nov 25, 2026 4:34 AM"))
    }
}
