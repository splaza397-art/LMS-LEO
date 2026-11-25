package org.iinicia.app.core.network

import kotlinx.coroutines.async
import kotlinx.coroutines.delay
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.withTimeout
import mockwebserver3.MockResponse
import mockwebserver3.MockWebServer
import okhttp3.OkHttpClient
import org.iinicia.app.core.security.SessionExpiredException
import org.iinicia.app.data.models.Profile
import org.iinicia.app.testing.FakeAuthenticator
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Assert.fail
import org.junit.Before
import org.junit.Test
import java.util.concurrent.TimeUnit

/** Cliente HTTP contra un servidor local real (MockWebServer): encabezados, errores, tiempo agotado y cancelación. */
class ApiClientTest {
    private val server = MockWebServer()
    private val session = FakeAuthenticator()
    private lateinit var client: ApiClient

    @Before fun setUp() {
        server.start()
        val http = OkHttpClient.Builder().readTimeout(1, TimeUnit.SECONDS).build()
        client = ApiClient(session, server.url("/api/v1").toString().trimEnd('/'), http)
    }

    @After fun tearDown() = server.close()

    private fun respond(code: Int, body: String = "{}") = server.enqueue(MockResponse.Builder().code(code).body(body).build())

    private inline fun <reified E : Throwable> expectError(noinline block: suspend () -> Unit): E = runBlocking {
        try {
            block()
            fail("Se esperaba ${E::class.simpleName}")
            throw AssertionError()
        } catch (e: Throwable) {
            assertTrue("Se esperaba ${E::class.simpleName} y llegó ${e::class.simpleName}", e is E)
            e as E
        }
    }

    @Test fun `envia el token de la sesion y pide JSON`() = runBlocking {
        respond(200, """{"id":"u1","email":"ana@ejemplo.test","firstName":"Ana","lastName":"Prueba","status":"activo","extra":1}""")
        val profile = client.get<Profile>("me")
        assertEquals("Ana", profile.firstName) // un campo desconocido ("extra") no rompe la lectura
        val request = server.takeRequest()
        assertEquals("Bearer token-de-prueba", request.headers["Authorization"])
        assertEquals("application/json", request.headers["Accept"])
        assertEquals("/api/v1/me", request.url.encodedPath)
    }

    @Test fun `401 es sesion vencida`() {
        respond(401)
        expectError<SessionExpiredException> { client.request("me") }
    }

    @Test fun `400 usa el mensaje del backend, en texto o en lista`() {
        respond(400, """{"message":"El correo no es válido","statusCode":400}""")
        assertEquals("El correo no es válido", expectError<AppError.BadRequest> { client.request("me") }.message)
        respond(400, """{"message":["Falta el nombre","Falta el correo"]}""")
        assertEquals("Falta el nombre. Falta el correo", expectError<AppError.BadRequest> { client.request("me") }.message)
    }

    @Test fun `cada estado HTTP tiene su error`() {
        respond(403); expectError<AppError.Forbidden> { client.request("me") }
        respond(404); expectError<AppError.NotFound> { client.request("me") }
        respond(429); expectError<AppError.RateLimited> { client.request("me") }
        respond(502); expectError<AppError.CampusUnavailable> { client.request("me") }
        respond(503); expectError<AppError.ServiceUnavailable> { client.request("me") }
        respond(500); expectError<AppError.Server> { client.request("me") }
    }

    @Test fun `un mensaje del backend en un 500 no se muestra`() {
        respond(500, """{"message":"Error interno: detalle técnico"}""")
        val error = expectError<AppError.Server> { client.request("me") }
        assertFalse(error.message!!.contains("detalle técnico"))
    }

    @Test fun `tiempo agotado`() {
        server.enqueue(MockResponse.Builder().code(200).body("{}").headersDelay(3, TimeUnit.SECONDS).build())
        expectError<AppError.Timeout> { client.request("me") }
    }

    @Test fun `sin servidor es error de red`() {
        server.close()
        expectError<AppError.Network> { client.request("me") }
    }

    @Test fun `cancelar la corrutina cancela la solicitud HTTP`() = runBlocking {
        server.enqueue(MockResponse.Builder().code(200).body("{}").headersDelay(10, TimeUnit.SECONDS).build())
        val slow = ApiClient(session, server.url("/api/v1").toString().trimEnd('/'))
        val call = async { slow.request("me") }
        delay(300)
        val started = System.nanoTime()
        withTimeout(2_000) { call.cancel(); call.join() }
        assertTrue("La cancelación no esperó a la respuesta", (System.nanoTime() - started) / 1_000_000 < 2_000)
        assertTrue(call.isCancelled)
    }

    @Test fun `ningun mensaje de error contiene el token`() {
        for (code in listOf(400, 403, 404, 429, 500, 502, 503)) {
            respond(code, """{"message":"x"}""")
            val error = runBlocking { runCatching { client.request("me") }.exceptionOrNull() }!!
            assertFalse("El error $code expone el token", error.message.orEmpty().contains("token-de-prueba"))
        }
    }

    @Test fun `sin sesion no se envia nada`() {
        session.tokenError = SessionExpiredException()
        expectError<SessionExpiredException> { client.request("me") }
        assertEquals(0, server.requestCount)
    }
}
