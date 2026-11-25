package org.iinicia.app.core.common

import org.iinicia.app.core.network.ApiException
import java.io.IOException

/** Mensaje para la persona a partir de un error (sin detalles técnicos ni datos de la sesión). */
fun friendlyMessage(error: Throwable): String = when (error) {
    is ApiException -> error.message ?: "Ocurrió un error"
    is IOException -> "Sin conexión. Revisa tu internet e intenta de nuevo."
    else -> "Ocurrió un error inesperado"
}
