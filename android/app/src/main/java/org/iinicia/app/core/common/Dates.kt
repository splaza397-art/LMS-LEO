package org.iinicia.app.core.common

import java.text.DateFormat
import java.util.Date

/** Fecha y hora local a partir de segundos Unix (como las envía Moodle). */
fun formatUnixDate(seconds: Long): String = formatMillis(seconds * 1000)

/**
 * Aviso de datos guardados. Algunas configuraciones regionales terminan la hora con punto ("12:05 p. m."): no se
 * agrega un segundo punto (hallazgo de la Fase 4.9).
 */
fun savedCopyNotice(date: String): String = "No se pudo actualizar. Mostrando la información guardada el ${date.trimEnd('.')}."

/** Fecha y hora local a partir de milisegundos. */
fun formatMillis(millis: Long): String =
    DateFormat.getDateTimeInstance(DateFormat.MEDIUM, DateFormat.SHORT).format(Date(millis))
