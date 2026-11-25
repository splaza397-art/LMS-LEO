package org.iinicia.app.navigation

import android.net.Uri
import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.style.TextOverflow
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.navigation.NavDestination
import androidx.navigation.NavDestination.Companion.hasRoute
import androidx.navigation.NavGraph.Companion.findStartDestination
import androidx.navigation.NavHostController
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.currentBackStackEntryAsState
import androidx.navigation.compose.rememberNavController
import androidx.navigation.toRoute
import kotlinx.coroutines.flow.MutableStateFlow
import org.iinicia.app.di.AppContainer
import org.iinicia.app.features.courses.CourseDetailScreen
import org.iinicia.app.features.courses.CourseDetailViewModel
import org.iinicia.app.features.courses.CoursesScreen
import org.iinicia.app.features.courses.CoursesViewModel
import org.iinicia.app.features.home.HomeScreen
import org.iinicia.app.features.home.HomeViewModel
import org.iinicia.app.features.notifications.NotificationsScreen
import org.iinicia.app.features.notifications.NotificationsViewModel
import org.iinicia.app.features.profile.ProfileScreen
import org.iinicia.app.features.profile.ProfileViewModel
import org.iinicia.app.ui.components.EventEffect
import org.iinicia.app.ui.theme.Navy

/** Área protegida: barra superior, pestañas y el grafo de navegación central. */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun MainScaffold(
    container: AppContainer,
    deepLink: MutableStateFlow<Uri?>,
    onLogout: () -> Unit,
    onOpenUrl: (String) -> Unit,
    onEnableNotifications: () -> Unit = {},
) {
    val nav = rememberNavController()
    val snackbar = remember { SnackbarHostState() }
    val link by deepLink.collectAsStateWithLifecycle()
    val entry by nav.currentBackStackEntryAsState()
    val destination = entry?.destination
    val onCourse = destination?.hasRoute<CourseRoute>() == true
    val openCourse: (Int, String?) -> Unit = { id, title -> nav.navigate(CourseRoute(id, title)) }

    // Los deep links llegan aquí solo con sesión; sin sesión quedan pendientes hasta iniciarla.
    LaunchedEffect(link) {
        val uri = link ?: return@LaunchedEffect
        when (val route = deepLinkRoute(uri.scheme, uri.host, uri.lastPathSegment)) {
            null -> Unit
            is CourseRoute -> nav.navigate(route)
            // Una pestaña se abre igual que desde la barra inferior; con navigate() simple, al tocar otra pestaña
            // se restauraba una pila guardada que terminaba en esta y la pantalla no cambiaba.
            else -> nav.navigateToTab(route)
        }
        deepLink.value = null
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = {
                    Text(
                        titleFor(destination, entry?.takeIf { onCourse }?.toRoute<CourseRoute>()),
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                        modifier = Modifier.semantics { heading() },
                    )
                },
                navigationIcon = {
                    if (onCourse) IconButton(onClick = { nav.popBackStack() }) { Icon(Icons.AutoMirrored.Filled.ArrowBack, "Volver") }
                },
                colors = TopAppBarDefaults.topAppBarColors(
                    containerColor = Navy, titleContentColor = Color.White, navigationIconContentColor = Color.White,
                ),
            )
        },
        bottomBar = { BottomBar(nav, destination) },
        snackbarHost = { SnackbarHost(snackbar) },
    ) { padding ->
        NavHost(nav, startDestination = HomeRoute, Modifier.padding(padding)) {
            composable<HomeRoute> {
                val vm = viewModel { HomeViewModel(container.profiles, container.courses, container.auth) }
                EventEffect(vm.events, snackbar, onOpenUrl)
                HomeScreen(vm, openCourse)
            }
            composable<CoursesRoute> {
                val vm = viewModel { CoursesViewModel(container.courses, container.auth) }
                CoursesScreen(vm, openCourse)
            }
            composable<NoticesRoute> {
                val vm = viewModel { NotificationsViewModel(container.notices, container.auth) }
                EventEffect(vm.events, snackbar, onOpenUrl)
                NotificationsScreen(vm)
            }
            composable<ProfileRoute> {
                val vm = viewModel { ProfileViewModel(container.profiles, container.settings, container.scheduler, container.auth) }
                ProfileScreen(vm, onLogout, onEnableNotifications)
            }
            composable<CourseRoute> { back ->
                val route = back.toRoute<CourseRoute>()
                val vm = viewModel { CourseDetailViewModel(route.id, container.courses, container.auth) }
                EventEffect(vm.events, snackbar, onOpenUrl)
                CourseDetailScreen(vm)
            }
        }
    }
}

private fun titleFor(destination: NavDestination?, course: CourseRoute?): String =
    course?.let { it.title ?: "Curso" }
        ?: TABS.firstOrNull { tab -> destination?.hasRoute(tab.route::class) == true }?.label
        ?: "IINICIA"

/**
 * Pestañas: cada una conserva su estado. "Atrás" desde una pestaña vuelve a Inicio, y desde Inicio sale de la app.
 */
@Composable
private fun BottomBar(nav: NavHostController, destination: NavDestination?) {
    NavigationBar {
        TABS.forEach { tab ->
            NavigationBarItem(
                selected = destination?.hasRoute(tab.route::class) == true,
                onClick = { nav.navigateToTab(tab.route) },
                icon = { Icon(tab.icon, contentDescription = null) },
                label = { Text(tab.label) },
            )
        }
    }
}

/** Cambia de pestaña conservando el estado de cada una (patrón de navegación inferior de Material). */
fun NavHostController.navigateToTab(route: Any) = navigate(route) {
    popUpTo(graph.findStartDestination().id) { saveState = true }
    launchSingleTop = true
    restoreState = true
}
