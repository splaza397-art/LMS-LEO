package org.iinicia.app.data.models

/** Etiquetas en español de los estados de cuenta (las mismas que usa el portal en frontend/src/config/labels.ts). */
private val STATUS_LABELS = mapOf(
    "aspirante" to "Aspirante",
    "admitido" to "Admitido",
    "activo" to "Activo",
    "suspendido" to "Suspendido",
)

/** Un estado desconocido se muestra tal cual, en vez de ocultarlo. */
val Profile.statusLabel: String get() = STATUS_LABELS[status] ?: status
