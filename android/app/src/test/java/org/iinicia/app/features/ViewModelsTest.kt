package org.iinicia.app.features

import android.content.Intent
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.withTimeout
import org.iinicia.app.core.common.UiEvent
import org.iinicia.app.core.network.AppError
import org.iinicia.app.core.network.AppJson
import org.iinicia.app.core.security.LoginCancelledException
import org.iinicia.app.core.security.SessionExpiredException
import org.iinicia.app.core.storage.MemoryStore
import org.iinicia.app.data.local.OfflineCache
import org.iinicia.app.data.repositories.CourseRepository
import org.iinicia.app.data.repositories.NotificationRepository
import org.iinicia.app.data.repositories.ProfileRepository
import org.iinicia.app.data.repositories.SettingsRepository
import org.iinicia.app.features.auth.AuthViewModel
import org.iinicia.app.features.courses.CourseDetailViewModel
import org.iinicia.app.features.courses.CoursesViewModel
import org.iinicia.app.features.home.HomeViewModel
import org.iinicia.app.features.notifications.NotificationsViewModel
import org.iinicia.app.features.profile.ProfileViewModel
import org.iinicia.app.testing.FakeApi
import org.iinicia.app.testing.FakeAuthenticator
import org.iinicia.app.testing.FakeScheduler
import org.iinicia.app.testing.MainDispatcherRule
import org.iinicia.app.testing.Sample
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test

class ViewModelsTest {
    @get:Rule val main = MainDispatcherRule()

    private val api = FakeApi()
    private val session = FakeAuthenticator()
    private val store = MemoryStore()
    private val cache = OfflineCache(store, AppJson, owner = { session.userId })
    private val profiles = ProfileRepository(api, cache)
    private val courses = CourseRepository(api, cache)
    private val notices = NotificationRepository(api, cache)
    private val scheduler = FakeScheduler()

    private fun home() = HomeViewModel(profiles, courses, session)

    // --- Inicio

    @Test fun `inicio con datos`() {
        val state = home().state.value
        assertFalse(state.loading)
        assertEquals("Ana", state.profile?.firstName)
        assertEquals(1, state.courses.size)
        assertEquals(1, state.upcoming.size)
        assertTrue(state.canUseCampus)
        assertNull(state.error)
        assertNull(state.academicError)
        assertNull(state.savedAt)
    }

    @Test fun `estado de carga mientras llegan los datos`() {
        val gate = CompletableDeferred<Unit>()
        api.onMe = { gate.await(); Sample.profile() }
        val vm = home()
        assertTrue(vm.state.value.loading)
        assertNull(vm.state.value.profile)
        gate.complete(Unit)
        assertFalse(vm.state.value.loading)
    }

    @Test fun `si Moodle no responde se ve el perfil y un aviso solo en la parte academica`() {
        api.onCourses = { throw AppError.CampusUnavailable() }
        api.onUpcoming = { throw AppError.CampusUnavailable() }
        val state = home().state.value
        assertEquals("Ana", state.profile?.firstName)
        assertEquals("El campus no responde en este momento. Intenta más tarde.", state.academicError)
        assertNull(state.error)
        assertTrue(state.courses.isEmpty())
    }

    @Test fun `sin conexion y con copia guardada se muestra la copia con su fecha`() {
        home()
        api.onMe = { throw AppError.Network() }
        api.onCourses = { throw AppError.Network() }
        api.onUpcoming = { throw AppError.Network() }
        val vm = home()
        vm.refresh()
        val state = vm.state.value
        assertEquals("Ana", state.profile?.firstName)
        assertEquals(1, state.courses.size)
        assertTrue(state.savedAt != null)
    }

    @Test fun `sin perfil ni copia la pantalla muestra el error`() {
        api.onMe = { throw AppError.Network() }
        val state = home().state.value
        assertNull(state.profile)
        assertEquals("Sin conexión. Revisa tu internet e intenta de nuevo.", state.error)
    }

    @Test fun `sesion vencida cierra la sesion`() {
        // Como un 401 del backend: el cliente HTTP lo convierte en SessionExpiredException.
        api.onCourses = { throw SessionExpiredException() }
        home()
        assertTrue(session.clearCalls > 0)
        assertFalse(session.signedIn.value)
    }

    @Test fun `aspirante sin acceso al campus`() {
        api.onMe = { Sample.profile(campus = false) }
        api.onCourses = { emptyList() }
        assertFalse(home().state.value.canUseCampus)
    }

    @Test fun `entrar al campus abre el enlace de inicio de sesion unico`() = runTest {
        val vm = home()
        vm.openCampus()
        val event = withTimeout(1_000) { vm.events.first() }
        assertTrue(event is UiEvent.OpenUrl)
        assertTrue("campusLink/null/null" in api.calls)
    }

    // --- Cursos

    @Test fun `lista vacia de cursos`() {
        api.onCourses = { emptyList() }
        val state = CoursesViewModel(courses, session).state.value
        assertEquals(emptyList<Any>(), state.data)
        assertFalse(state.loading)
    }

    @Test fun `detalle de curso y apertura de una actividad en el campus`() = runTest {
        val vm = CourseDetailViewModel(7, courses, session)
        assertEquals("Curso Ficticio", vm.state.value.data?.fullname)
        vm.openInCampus(cmid = 11)
        assertTrue(withTimeout(1_000) { vm.events.first() } is UiEvent.OpenUrl)
        assertTrue("campusLink/null/11" in api.calls)
    }

    @Test fun `curso no disponible explica el motivo`() = runTest {
        api.onCourse = { throw AppError.NotFound() }
        val state = CourseDetailViewModel(99, courses, session).state.value
        assertEquals("Contenido no disponible.", state.error)
        assertNull(state.data)
    }

    @Test fun `si no se puede abrir el campus se explica por que`() = runTest {
        api.onCampusLink = { _, _ -> throw AppError.Forbidden() }
        val vm = CourseDetailViewModel(7, courses, session)
        vm.openInCampus()
        val event = withTimeout(1_000) { vm.events.first() } as UiEvent.Message
        assertEquals("No tienes permiso para esta acción.", event.text)
    }

    // --- Avisos

    @Test fun `marcar como leido actualiza la lista`() {
        val vm = NotificationsViewModel(notices, session)
        api.onNotifications = { listOf(Sample.notice("n1", read = true), Sample.notice("n2", read = true)) }
        vm.markRead("n1")
        assertTrue(vm.state.value.data!!.all { it.readAt != null })
    }

    @Test fun `si marcar como leido falla se avisa, el aviso sigue sin leer y no se reintenta`() = runTest {
        val vm = NotificationsViewModel(notices, session)
        api.onMarkRead = { throw AppError.Server() }
        vm.markRead("n1")
        val event = withTimeout(1_000) { vm.events.first() } as UiEvent.Message
        assertTrue(event.text.startsWith("No se pudo marcar como leído."))
        assertNull(vm.state.value.data!!.first { it.id == "n1" }.readAt)
        assertEquals(1, api.count("markRead/n1"))
    }

    // --- Perfil

    @Test fun `perfil y preferencia de notificaciones`() {
        val settings = SettingsRepository(store)
        val vm = ProfileViewModel(profiles, settings, scheduler, session)
        assertEquals("Ana", vm.state.value.data?.firstName)
        vm.setNotificationsEnabled(false)
        assertFalse(settings.notificationsEnabled)
        assertEquals(1, scheduler.cancelled)
        vm.setNotificationsEnabled(true)
        assertEquals(1, scheduler.scheduled)
    }

    // --- Sesión

    @Test fun `iniciar sesion programa los avisos y pide el permiso despues`() = runTest {
        session.state.value = false
        val vm = AuthViewModel(session, scheduler)
        vm.onLoginResult(Intent())
        assertTrue(vm.signedIn.value)
        assertEquals(1, scheduler.scheduled)
        withTimeout(1_000) { vm.askNotifications.first() }
        assertNull(vm.loginError.value)
    }

    @Test fun `cerrar el navegador sin iniciar sesion no es un error`() {
        session.state.value = false
        session.loginBehavior = { throw LoginCancelledException() }
        val vm = AuthViewModel(session, scheduler)
        vm.onLoginResult(Intent())
        vm.onLoginResult(null)
        assertNull(vm.loginError.value)
        assertFalse(vm.signedIn.value)
    }

    @Test fun `sin red al iniciar sesion se explica`() {
        session.state.value = false
        session.loginBehavior = { throw AppError.Network() }
        val vm = AuthViewModel(session, scheduler)
        vm.onLoginResult(Intent())
        assertEquals("No se pudo iniciar sesión. Sin conexión. Revisa tu internet e intenta de nuevo.", vm.loginError.value)
    }

    @Test fun `cerrar sesion cancela los avisos y cierra la sesion local`() {
        val vm = AuthViewModel(session, scheduler)
        vm.logout()
        assertEquals(1, scheduler.cancelled)
        assertEquals(1, session.logoutCalls)
        assertFalse(vm.signedIn.value)
    }
}
