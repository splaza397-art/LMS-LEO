package org.iinicia.app.data

import kotlinx.coroutines.test.runTest
import org.iinicia.app.core.security.SessionExpiredException
import org.iinicia.app.core.storage.MemoryStore
import org.iinicia.app.data.repositories.CampusCallback
import org.iinicia.app.data.repositories.CampusFlowException
import org.iinicia.app.data.repositories.CampusLinks
import org.iinicia.app.testing.FakeApi
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertThrows
import org.junit.Assert.assertTrue
import org.junit.Test

/** Fase 4.11: la entrada al campus desde la app solo continúa con el state que la propia app inició. */
class CampusLinksTest {
    private val api = FakeApi().apply { onCampusLink = { _, _ -> "http://localhost:8081/local/iinicia/sso.php?start=1" } }
    private val store = MemoryStore()
    private var now = 1_000_000L
    private var owner: String? = "cuenta-a"
    private val links = CampusLinks(api, store, owner = { owner }, clock = { now })
    private val bind = "b".repeat(43)

    private fun stateOf(url: String) = Regex("state=([A-Za-z0-9_-]+)").find(url)!!.groupValues[1]
    private suspend fun start() = stateOf(links.start(courseId = 3))
    private fun expectRejected(block: suspend () -> Unit) {
        assertThrows(CampusFlowException::class.java) { kotlinx.coroutines.runBlocking { block() } }
    }

    @Test fun `el paso 1 agrega a la app como cliente y un state aleatorio`() = runTest {
        val url = links.start(courseId = 3)
        assertTrue(url.startsWith("http://localhost:8081/local/iinicia/sso.php?start=1&client=app&state="))
        assertEquals(32, stateOf(url).length)
        assertNotEquals(stateOf(url), stateOf(links.start(courseId = 3)))
    }

    @Test fun `con el state correcto pide el comprobante vinculado a ese navegador`() = runTest {
        val state = start()
        links.complete(CampusCallback(state, bind, courseId = 3, cmid = null))
        assertEquals(listOf(null, bind), api.campusBinds)
        assertEquals(listOf("campusLink/3/null", "campusLink/3/null"), api.calls)
    }

    @Test fun `el state sirve una sola vez`() = runTest {
        val state = start()
        links.complete(CampusCallback(state, bind, 3, null))
        expectRejected { links.complete(CampusCallback(state, bind, 3, null)) }
    }

    @Test fun `una vuelta que la app no inicio se rechaza sin pedir comprobante`() = runTest {
        start()
        expectRejected { links.complete(CampusCallback("state-de-otra-pagina-1234567890", bind, 3, null)) }
        expectRejected { links.complete(CampusCallback(null, bind, 3, null)) }
        assertEquals(listOf<String?>(null), api.campusBinds)
    }

    @Test fun `un state vencido se rechaza`() = runTest {
        val state = start()
        now += 5 * 60_000L + 1
        expectRejected { links.complete(CampusCallback(state, bind, 3, null)) }
    }

    @Test fun `tras cambiar de cuenta el state de la anterior no sirve`() = runTest {
        val state = start()
        owner = "cuenta-b"
        expectRejected { links.complete(CampusCallback(state, bind, 3, null)) }
    }

    @Test fun `tras cerrar sesion se borra el state`() = runTest {
        val state = start()
        store.clear() // lo que hace AuthManager al cerrar sesión
        expectRejected { links.complete(CampusCallback(state, bind, 3, null)) }
    }

    @Test fun `un valor de vinculacion invalido se rechaza`() = runTest {
        val state = start()
        expectRejected { links.complete(CampusCallback(state, "corto", 3, null)) }
    }

    @Test fun `si la sesion vencio el error llega a la pantalla`() = runTest {
        val state = start()
        api.onCampusLink = { _, _ -> throw SessionExpiredException() }
        assertThrows(SessionExpiredException::class.java) { kotlinx.coroutines.runBlocking { links.complete(CampusCallback(state, bind, 3, null)) } }
    }
}
