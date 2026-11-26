package org.iinicia.app.core.network

import kotlinx.serialization.SerializationException
import org.iinicia.app.core.common.friendlyMessage
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.IOException
import java.net.ConnectException
import java.net.SocketTimeoutException
import java.net.UnknownHostException

class AppErrorTest {
    @Test fun `solo los errores pasajeros permiten mostrar datos guardados`() {
        val transient = listOf(502, 503, 504, 500, 408).map { AppError.fromStatus(it) } + AppError.Network() + AppError.Timeout()
        val definitive = listOf(400, 403, 404, 422, 429).map { AppError.fromStatus(it) }
        assertTrue(transient.all { it.transient })
        assertTrue(definitive.none { it.transient })
    }

    @Test fun `fallas de red y de tiempo`() {
        assertTrue(AppError.fromIo(SocketTimeoutException()) is AppError.Timeout)
        assertTrue(AppError.fromIo(UnknownHostException()) is AppError.Network)
        assertTrue(AppError.fromIo(ConnectException()) is AppError.Network)
        val same = AppError.CampusUnavailable()
        assertTrue(AppError.fromIo(same) === same)
    }

    @Test fun `el detalle del backend solo se usa en validacion`() {
        assertEquals("Falta el correo", AppError.fromStatus(400, "Falta el correo").message)
        assertEquals("La solicitud no es válida.", AppError.fromStatus(400, null).message)
        assertFalse(AppError.fromStatus(500, "stack trace").message!!.contains("stack"))
    }

    @Test fun `mensajes en espanol sin detalles tecnicos`() {
        assertEquals("El campus no responde en este momento. Intenta más tarde.", friendlyMessage(AppError.fromStatus(502)))
        assertEquals("Sin conexión. Revisa tu internet e intenta de nuevo.", friendlyMessage(IOException("socket closed")))
        assertEquals("La respuesta del servidor no es válida. Intenta más tarde.", friendlyMessage(SerializationException("campo")))
        assertEquals("Ocurrió un error inesperado.", friendlyMessage(IllegalStateException("interno")))
    }
}
