package org.iinicia.app.core.network

import kotlinx.serialization.json.Json

/** JSON tolerante: el backend puede agregar campos sin romper versiones anteriores de la app. */
val AppJson = Json { ignoreUnknownKeys = true; coerceInputValues = true; explicitNulls = false }
