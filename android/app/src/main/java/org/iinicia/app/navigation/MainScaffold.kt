package org.iinicia.app.navigation

import android.net.Uri
import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Home
import androidx.compose.material.icons.filled.Notifications
import androidx.compose.material.icons.filled.Person
import androidx.compose.material.icons.filled.School
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
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.navigation.NavGraph.Companion.findStartDestination
import androidx.navigation.NavHostController
import androidx.navigation.NavType
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.currentBackStackEntryAsState
import androidx.navigation.compose.rememberNavController
import androidx.navigation.navArgument
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

private data class Tab(val route: String, val label: String, val icon: ImageVector)

private val TABS = listOf(
    Tab("inicio", "Inicio", Icons.Default.Home),
    Tab("cursos", "Cursos", Icons.Default.School),
    Tab("avisos", "Avisos", Icons.Default.Notifications),
    Tab("perfil", "Perfil", Icons.Default.Person),
)

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun MainScaffold(container: AppContainer, deepLink: MutableStateFlow<Uri?>, onLogout: () -> Unit, onOpenUrl: (String) -> Unit) {
    val nav = rememberNavController()
    val snackbar = remember { SnackbarHostState() }
    val link by deepLink.collectAsStateWithLifecycle()
    val entry by nav.currentBackStackEntryAsState()
    val route = entry?.destination?.route

    LaunchedEffect(link) {
        val uri = link ?: return@LaunchedEffect
        when (uri.host) {
            "curso" -> uri.lastPathSegment?.toIntOrNull()?.let { nav.navigate("curso/$it") }
            "notificaciones" -> nav.navigate("avisos")
        }
        deepLink.value = null
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text(TABS.firstOrNull { it.route == route }?.label ?: "Curso") },
                navigationIcon = {
                    if (route?.startsWith("curso/") == true) {
                        IconButton(onClick = { nav.popBackStack() }) { Icon(Icons.AutoMirrored.Filled.ArrowBack, "Volver") }
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(
                    containerColor = Navy, titleContentColor = Color.White, navigationIconContentColor = Color.White,
                ),
            )
        },
        bottomBar = { BottomBar(nav, route) },
        snackbarHost = { SnackbarHost(snackbar) },
    ) { padding ->
        NavHost(nav, startDestination = "inicio", Modifier.padding(padding)) {
            composable("inicio") {
                val vm = viewModel { HomeViewModel(container.profiles, container.courses, container.auth) }
                EventEffect(vm.events, snackbar, onOpenUrl)
                HomeScreen(vm, openCourse = { nav.navigate("curso/$it") })
            }
            composable("cursos") {
                val vm = viewModel { CoursesViewModel(container.courses, container.auth) }
                CoursesScreen(vm, open = { nav.navigate("curso/$it") })
            }
            composable("avisos") {
                val vm = viewModel { NotificationsViewModel(container.notices, container.auth) }
                EventEffect(vm.events, snackbar, onOpenUrl)
                NotificationsScreen(vm)
            }
            composable("perfil") {
                val vm = viewModel { ProfileViewModel(container.profiles, container.settings, container.scheduler, container.auth) }
                ProfileScreen(vm, onLogout)
            }
            composable("curso/{id}", arguments = listOf(navArgument("id") { type = NavType.IntType })) { back ->
                val id = back.arguments?.getInt("id") ?: return@composable
                val vm = viewModel { CourseDetailViewModel(id, container.courses, container.auth) }
                EventEffect(vm.events, snackbar, onOpenUrl)
                CourseDetailScreen(vm)
            }
        }
    }
}

@Composable
private fun BottomBar(nav: NavHostController, route: String?) {
    NavigationBar {
        TABS.forEach { tab ->
            NavigationBarItem(
                selected = route == tab.route,
                onClick = {
                    nav.navigate(tab.route) {
                        popUpTo(nav.graph.findStartDestination().id) { saveState = true }
                        launchSingleTop = true
                        restoreState = true
                    }
                },
                icon = { Icon(tab.icon, contentDescription = null) },
                label = { Text(tab.label) },
            )
        }
    }
}
