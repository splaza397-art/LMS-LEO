package org.iinicia.app.core.common

import java.text.DateFormat
import java.util.Date

/** Fecha y hora local a partir de segundos Unix (como las envía Moodle). */
fun formatUnixDate(seconds: Long): String = formatMillis(seconds * 1000)

/** Fecha y hora local a partir de milisegundos. */
fun formatMillis(millis: Long): String =
    DateFormat.getDateTimeInstance(DateFormat.MEDIUM, DateFormat.SHORT).format(Date(millis))
