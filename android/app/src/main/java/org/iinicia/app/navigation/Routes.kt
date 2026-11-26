package org.iinicia.app.navigation

import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Home
import androidx.compose.material.icons.filled.Notifications
import androidx.compose.material.icons.filled.Person
import androidx.compose.material.icons.filled.School
import androidx.compose.ui.graphics.vector.ImageVector
import kotlinx.serialization.Serializable

/** Destinos del área protegida (navegación con tipos: los argumentos se validan al compilar). */
@Serializable data object HomeRoute

@Serializable data object CoursesRoute

@Serializable data object NoticesRoute

@Serializable data object ProfileRoute

/** title: nombre para la barra superior cuando se conoce (al llegar desde una tarjeta); por deep link es null. */
@Serializable data class CourseRoute(val id: Int, val title: String? = null)

data class Tab(val route: Any, val label: String, val icon: ImageVector)

val TABS = listOf(
    Tab(HomeRoute, "Inicio", Icons.Default.Home),
    Tab(CoursesRoute, "Cursos", Icons.Default.School),
    Tab(NoticesRoute, "Avisos", Icons.Default.Notifications),
    Tab(ProfileRoute, "Perfil", Icons.Default.Person),
)

/**
 * Destino de un deep link (iinicia://curso/{id} o iinicia://notificaciones), o null si no es válido.
 * Solo navega dentro de la app: no abre URLs externas ni acepta otros hosts o IDs que no sean números positivos.
 */
fun deepLinkRoute(scheme: String?, host: String?, lastSegment: String?): Any? {
    if (scheme != "iinicia") return null
    return when (host) {
        "curso" -> lastSegment?.toIntOrNull()?.takeIf { it > 0 }?.let { CourseRoute(it) }
        "notificaciones" -> NoticesRoute
        else -> null
    }
}
