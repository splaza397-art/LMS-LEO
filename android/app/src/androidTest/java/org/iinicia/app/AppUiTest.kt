package org.iinicia.app

import android.net.Uri
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.semantics.SemanticsProperties
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.hasText
import androidx.compose.ui.test.isToggleable
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onAllNodesWithText
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performScrollTo
import androidx.compose.ui.unit.Density
import androidx.test.ext.junit.runners.AndroidJUnit4
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.flow.MutableStateFlow
import org.iinicia.app.core.network.AppError
import org.iinicia.app.core.security.SessionExpiredException
import org.iinicia.app.core.storage.MemoryStore
import org.iinicia.app.di.AppContainer
import org.iinicia.app.features.auth.AuthViewModel
import org.iinicia.app.navigation.AppRoot
import org.iinicia.app.testing.FakeApi
import org.iinicia.app.testing.FakeAuthenticator
import org.iinicia.app.testing.FakeScheduler
import org.iinicia.app.testing.Sample
import org.iinicia.app.ui.theme.IiniciaTheme
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith

/**
 * Pruebas de interfaz de la app completa (AppRoot con navegación y ViewModels reales) con dobles de la sesión y de la
 * API: no usan Keycloak, el backend ni cuentas reales. Todos los datos son ficticios.
 */
@RunWith(AndroidJUnit4::class)
class AppUiTest {
    @get:Rule val compose = createComposeRule()

    private val auth = FakeAuthenticator()
    private val api = FakeApi()
    private val scheduler = FakeScheduler()
    private var loginClicks = 0
    private val opened = mutableListOf<String>()

    private val deepLink = MutableStateFlow<Uri?>(null)

    private fun start(signedIn: Boolean = true, fontScale: Float = 1f) {
        auth.state.value = signedIn
        val container = AppContainer(auth, api, MemoryStore(), scheduler)
        val authViewModel = AuthViewModel(auth, scheduler, api)
        compose.setContent {
            val density = LocalDensity.current
            CompositionLocalProvider(LocalDensity provides Density(density.density, fontScale)) {
                IiniciaTheme {
                    AppRoot(container, authViewModel, deepLink, onLogin = { loginClicks++ }, onOpenUrl = { opened += it })
                }
            }
        }
    }

    private fun text(value: String) = compose.onNodeWithText(value, substring = false)

    @Test fun sinSesionSoloSeVeElInicioDeSesion() {
        start(signedIn = false)
        text("Iniciar sesión").assertIsDisplayed().performClick()
        assertEquals(1, loginClicks)
        text("Inicio").assertDoesNotExist()
        text("Perfil").assertDoesNotExist()
    }

    @Test fun inicioConCursosActividadesYCampus() {
        start()
        text("Hola, Ana").assertIsDisplayed()
        text("Próximas actividades").assertIsDisplayed()
        text("Tarea ficticia 11").assertIsDisplayed()
        text("CF-7").performScrollTo().assertIsDisplayed()
        text("Entrar al Campus").performClick()
        compose.waitUntil(3_000) { opened.isNotEmpty() }
        assertTrue(opened.single().startsWith("https://campus.ejemplo.test/"))
    }

    @Test fun estadoDeCarga() {
        val gate = CompletableDeferred<Unit>()
        api.onMe = { gate.await(); Sample.profile() }
        start()
        compose.onNodeWithContentDescription("Cargando").assertExists()
        gate.complete(Unit)
        compose.waitUntil(3_000) { compose.onAllNodesWithText("Hola, Ana").fetchSemanticsNodes().isNotEmpty() }
    }

    @Test fun errorDeConexionYReintentar() {
        api.onMe = { throw AppError.Network() }
        start()
        text("Sin conexión. Revisa tu internet e intenta de nuevo.").assertIsDisplayed()
        api.onMe = { Sample.profile() }
        text("Reintentar").performClick()
        compose.waitUntil(3_000) { compose.onAllNodesWithText("Hola, Ana").fetchSemanticsNodes().isNotEmpty() }
    }

    @Test fun moodleCaidoMuestraElRestoDeInicio() {
        api.onCourses = { throw AppError.CampusUnavailable() }
        api.onUpcoming = { throw AppError.CampusUnavailable() }
        start()
        text("Hola, Ana").assertIsDisplayed()
        text("No se pudieron cargar tus cursos").assertIsDisplayed()
        text("El campus no responde en este momento. Intenta más tarde.").assertIsDisplayed()
    }

    @Test fun listaVaciaDeCursos() {
        api.onCourses = { emptyList() }
        start()
        text("Cursos").performClick()
        text("Aún no tienes cursos asignados.").assertIsDisplayed()
    }

    @Test fun detalleDeCursoYVolver() {
        start()
        text("CF-7").performScrollTo().performClick()
        text("Unidad 1").assertIsDisplayed()
        text("Abrir en el campus").assertIsDisplayed()
        compose.onAllNodesWithText("Curso Ficticio")[0].assertIsDisplayed() // título en la barra superior
        text("Tarea ficticia 12").performClick()
        compose.waitUntil(3_000) { opened.isNotEmpty() }
        assertTrue(opened.single().contains("cmid=12"))
        compose.onNodeWithContentDescription("Volver").performClick()
        text("Hola, Ana").assertIsDisplayed()
    }

    /** Fase 4.11: desde un curso abierto, la pestaña Inicio vuelve a Inicio (antes restauraba el curso y no cambiaba). */
    @Test fun pestanaInicioDesdeUnCursoVuelveAInicio() {
        start()
        text("CF-7").performScrollTo().performClick()
        text("Abrir en el campus").assertIsDisplayed()
        text("Inicio").performClick()
        compose.waitUntil(3_000) { compose.onAllNodesWithText("Hola, Ana").fetchSemanticsNodes().isNotEmpty() }
        text("Abrir en el campus").assertDoesNotExist()
    }

    /** Fase 4.11: un deep link a Avisos llega aunque haya un curso abierto (por deep link) sobre la pestaña Avisos. */
    @Test fun deepLinkAAvisosConUnCursoAbierto() {
        start()
        text("Avisos").performClick()
        deepLink.value = Uri.parse("iinicia://curso/7")
        compose.waitUntil(3_000) { compose.onAllNodesWithText("Abrir en el campus").fetchSemanticsNodes().isNotEmpty() }
        deepLink.value = Uri.parse("iinicia://notificaciones")
        compose.waitUntil(3_000) { compose.onAllNodesWithText("Abrir en el campus").fetchSemanticsNodes().isEmpty() }
    }

    @Test fun avisosNuevosYMarcarComoLeido() {
        start()
        text("Avisos").performClick()
        text("Nuevo").assertIsDisplayed()
        api.onNotifications = { listOf(Sample.notice("n1", read = true), Sample.notice("n2", read = true)) }
        text("Aviso de prueba n1").performClick()
        compose.waitUntil(3_000) { compose.onAllNodesWithText("Nuevo").fetchSemanticsNodes().isEmpty() }
        assertTrue("markRead/n1" in api.calls)
    }

    @Test fun perfilYCierreDeSesionConConfirmacion() {
        start()
        text("Perfil").performClick()
        text("Estado: Activo").assertIsDisplayed()
        text("ana.prueba@ejemplo.test").assertIsDisplayed()
        text("Cerrar sesión").performClick()
        text("¿Cerrar sesión?").assertIsDisplayed()
        text("Cancelar").performClick()
        text("¿Cerrar sesión?").assertDoesNotExist()
        text("Cerrar sesión").performClick()
        compose.onAllNodesWithText("Cerrar sesión")[1].performClick() // botón del diálogo
        compose.waitUntil(3_000) { compose.onAllNodesWithText("Iniciar sesión").fetchSemanticsNodes().isNotEmpty() }
        text("Inicio").assertDoesNotExist()
        assertEquals(1, scheduler.cancelled)
    }

    /** Fase 4.10 (accesibilidad): el interruptor de notificaciones tiene nombre y se activa tocando toda la fila. */
    @Test fun interruptorDeNotificacionesConNombre() {
        start()
        text("Perfil").performClick()
        val node = compose.onNode(hasText("Notificaciones") and isToggleable())
        node.assertIsDisplayed()
        val before = node.fetchSemanticsNode().config[SemanticsProperties.ToggleableState]
        node.performClick()
        assertTrue(node.fetchSemanticsNode().config[SemanticsProperties.ToggleableState] != before)
    }

    /** A13: tras cerrar sesión, otra cuenta nunca ve los datos de la anterior. */
    @Test fun otraCuentaNoVeLosDatosDeLaAnterior() {
        start()
        text("Hola, Ana").assertIsDisplayed()
        auth.state.value = false
        compose.waitUntil(3_000) { compose.onAllNodesWithText("Iniciar sesión").fetchSemanticsNodes().isNotEmpty() }
        api.onMe = { Sample.profile(first = "Beto", last = "Ficticio", campus = false) }
        api.onCourses = { emptyList() }
        api.onUpcoming = { emptyList() }
        auth.user = "persona-b"
        auth.state.value = true
        compose.waitUntil(3_000) { compose.onAllNodesWithText("Hola, Beto").fetchSemanticsNodes().isNotEmpty() }
        text("Hola, Ana").assertDoesNotExist()
        text("CF-7").assertDoesNotExist()
        text("Entrar al Campus").assertDoesNotExist()
    }

    @Test fun sesionVencidaVuelveAlInicioDeSesion() {
        api.onCourses = { throw SessionExpiredException() }
        start()
        compose.waitUntil(3_000) { compose.onAllNodesWithText("Iniciar sesión").fetchSemanticsNodes().isNotEmpty() }
    }

    @Test fun letraAmpliadaSigueSiendoUsable() {
        start(fontScale = 2f)
        text("Hola, Ana").assertIsDisplayed()
        text("Entrar al Campus").performScrollTo().assertIsDisplayed()
        text("Perfil").performClick()
        text("Cerrar sesión").performScrollTo().assertIsDisplayed()
    }
}
