package org.iinicia.app.core.network

import java.io.IOException
import java.io.InterruptedIOException
import java.net.SocketTimeoutException

/**
 * Error de comunicación ya clasificado. Los mensajes son para la persona: nunca incluyen tokens, URL internas ni
 * detalles técnicos. Hereda de IOException para que los transitorios se traten como "sin conexión" donde ya se
 * esperaba una IOException.
 */
sealed class AppError(message: String, val transient: Boolean) : IOException(message) {
    /** Sin red, o el servidor no es alcanzable. */
    class Network : AppError("Sin conexión. Revisa tu internet e intenta de nuevo.", transient = true)

    /** El servidor no respondió a tiempo (por ejemplo, Moodle recién iniciado). */
    class Timeout : AppError("El servidor tardó demasiado en responder. Intenta de nuevo.", transient = true)

    /** 400 o 422: el mensaje del backend explica qué corregir. */
    class BadRequest(detail: String?) : AppError(detail ?: "La solicitud no es válida.", transient = false)

    class Forbidden : AppError("No tienes permiso para esta acción.", transient = false)

    class NotFound : AppError("Contenido no disponible.", transient = false)

    class RateLimited : AppError("Demasiadas solicitudes. Espera un momento e intenta de nuevo.", transient = false)

    /** 502: el backend no obtuvo respuesta de Moodle. */
    class CampusUnavailable : AppError("El campus no responde en este momento. Intenta más tarde.", transient = true)

    /** 503 o 504: otro servicio (por ejemplo, el de identidad) no está disponible. */
    class ServiceUnavailable : AppError("El servicio no está disponible en este momento. Intenta más tarde.", transient = true)

    class Server : AppError("Ocurrió un error en el servidor. Intenta más tarde.", transient = true)

    companion object {
        /** Clasifica una respuesta HTTP sin éxito. detail: mensaje del backend, solo se usa en errores de validación. */
        fun fromStatus(code: Int, detail: String? = null): AppError = when (code) {
            400, 422 -> BadRequest(detail)
            403 -> Forbidden()
            404 -> NotFound()
            408 -> Timeout()
            429 -> RateLimited()
            502 -> CampusUnavailable()
            503, 504 -> ServiceUnavailable()
            else -> Server()
        }

        /** Clasifica una falla de E/S de OkHttp o de AppAuth. */
        fun fromIo(error: IOException): AppError = when (error) {
            is AppError -> error
            is SocketTimeoutException -> Timeout()
            is InterruptedIOException -> Timeout()
            else -> Network()
        }
    }
}
