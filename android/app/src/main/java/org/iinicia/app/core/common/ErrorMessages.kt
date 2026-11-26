package org.iinicia.app.core.common

import kotlinx.serialization.SerializationException
import org.iinicia.app.core.network.AppError
import java.io.IOException

/** Mensaje para la persona a partir de un error, sin detalles técnicos ni datos de la sesión. */
fun friendlyMessage(error: Throwable): String = when (error) {
    is AppError -> error.message ?: "Ocurrió un error."
    is IOException -> AppError.fromIo(error).message ?: "Sin conexión."
    is SerializationException, is IllegalArgumentException -> "La respuesta del servidor no es válida. Intenta más tarde."
    else -> "Ocurrió un error inesperado."
}
