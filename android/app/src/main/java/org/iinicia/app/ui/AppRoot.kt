package org.iinicia.app.ui

import android.net.Uri
import androidx.compose.foundation.Image
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.navigation.NavGraph.Companion.findStartDestination
import androidx.navigation.NavHostController
import androidx.navigation.NavType
import androidx.navigation.compose.*
import androidx.navigation.navArgument
import kotlinx.coroutines.flow.MutableStateFlow
import org.iinicia.app.IiniciaApp
import org.iinicia.app.R
import org.iinicia.app.data.Activity
import org.iinicia.app.data.Course
import org.iinicia.app.data.Dashboard
import org.iinicia.app.notifications.NoticeWorker
import org.iinicia.app.ui.theme.Navy
import java.text.DateFormat
import java.util.Date

private data class Tab(val route: String, val label: String, val icon: androidx.compose.ui.graphics.vector.ImageVector)
private val TABS = listOf(
    Tab("inicio", "Inicio", Icons.Default.Home),
    Tab("cursos", "Cursos", Icons.Default.School),
    Tab("avisos", "Avisos", Icons.Default.Notifications),
    Tab("perfil", "Perfil", Icons.Default.Person),
)

private fun formatDate(unix: Long) = DateFormat.getDateTimeInstance(DateFormat.MEDIUM, DateFormat.SHORT).format(Date(unix * 1000))

@Composable
fun AppRoot(
    app: IiniciaApp,
    deepLink: MutableStateFlow<Uri?>,
    loginError: MutableStateFlow<String?>,
    onLogin: () -> Unit,
    onLogout: () -> Unit,
    onOpenCampus: (String) -> Unit,
) {
    val signedIn by app.auth.signedIn.collectAsStateWithLifecycle()
    val error by loginError.collectAsStateWithLifecycle()
    if (!signedIn) LoginScreen(error, onLogin)
    else key(signedIn) { MainScaffold(app, deepLink, onLogout, onOpenCampus) }
}

@Composable
private fun LoginScreen(error: String?, onLogin: () -> Unit) {
    Surface(color = Navy, modifier = Modifier.fillMaxSize()) {
        Column(
            Modifier.fillMaxSize().systemBarsPadding().padding(24.dp),
            verticalArrangement = Arrangement.Center,
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            Image(
                painter = painterResource(R.drawable.logo_iinicia),
                contentDescription = "IINICIA, Instituto de Innovación y Ciencias Aplicadas",
                modifier = Modifier.size(200.dp),
            )
            Spacer(Modifier.height(16.dp))
            Text("Tu educación comienza hoy, estés donde estés.", color = Color(0xFFBFDBFE), textAlign = TextAlign.Center)
            Spacer(Modifier.height(40.dp))
            Button(
                onClick = onLogin,
                colors = ButtonDefaults.buttonColors(containerColor = Color.White, contentColor = Navy),
                modifier = Modifier.fillMaxWidth().heightIn(min = 52.dp),
            ) { Text("Iniciar sesión", fontWeight = FontWeight.SemiBold) }
            error?.let {
                Spacer(Modifier.height(16.dp))
                Text(it, color = Color(0xFFFECACA))
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun MainScaffold(app: IiniciaApp, deepLink: MutableStateFlow<Uri?>, onLogout: () -> Unit, onOpenCampus: (String) -> Unit) {
    val nav = rememberNavController()
    val factory = remember { factory { DashboardViewModel(app) } }
    val vm: DashboardViewModel = viewModel(factory = factory)
    val state by vm.state.collectAsStateWithLifecycle()
    val message by vm.message.collectAsStateWithLifecycle()
    val link by deepLink.collectAsStateWithLifecycle()
    val snackbar = remember { SnackbarHostState() }
    val entry by nav.currentBackStackEntryAsState()
    val route = entry?.destination?.route

    LaunchedEffect(message) { message?.let { snackbar.showSnackbar(it); vm.message.value = null } }
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
                Loadable(state, vm::refresh) { data -> HomeScreen(data, { nav.navigate("curso/$it") }) { vm.openCampus(open = onOpenCampus) } }
            }
            composable("cursos") {
                Loadable(state, vm::refresh) { data -> CoursesScreen(data.courses) { nav.navigate("curso/$it") } }
            }
            composable("avisos") {
                Loadable(state, vm::refresh) { data -> NoticesScreen(data, vm::markRead) }
            }
            composable("perfil") {
                Loadable(state, vm::refresh) { data -> ProfileScreen(app, data, onLogout) }
            }
            composable("curso/{id}", arguments = listOf(navArgument("id") { type = NavType.IntType })) { back ->
                val id = back.arguments?.getInt("id") ?: return@composable
                val courseVm: CourseViewModel = viewModel(key = "curso-$id", factory = factory { CourseViewModel(app, id) })
                val courseState by courseVm.state.collectAsStateWithLifecycle()
                Loadable(courseState, courseVm::refresh) { course ->
                    CourseScreen(course, { vm.openCampus(courseId = course.id, open = onOpenCampus) }) { cmid ->
                        vm.openCampus(cmid = cmid, open = onOpenCampus)
                    }
                }
            }
        }
    }
}

private inline fun <VM : ViewModel> factory(crossinline create: () -> VM) = object : ViewModelProvider.Factory {
    @Suppress("UNCHECKED_CAST")
    override fun <T : ViewModel> create(modelClass: Class<T>): T = create() as T
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

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun <T> Loadable(state: UiState<T>, retry: () -> Any, content: @Composable (T) -> Unit) {
    val data = state.data
    when {
        data != null -> PullToRefreshBox(isRefreshing = state.loading, onRefresh = { retry() }, modifier = Modifier.fillMaxSize()) {
            Column {
                if (state.offline) OfflineBanner()
                state.error?.let { Text(it, color = MaterialTheme.colorScheme.error, modifier = Modifier.padding(16.dp)) }
                content(data)
            }
        }
        state.loading -> Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) { CircularProgressIndicator() }
        else -> Column(Modifier.fillMaxSize().padding(24.dp), verticalArrangement = Arrangement.Center, horizontalAlignment = Alignment.CenterHorizontally) {
            Text(state.error ?: "No se pudo cargar")
            Spacer(Modifier.height(12.dp))
            Button(onClick = { retry() }) { Text("Reintentar") }
        }
    }
}

@Composable
private fun OfflineBanner() = Surface(color = Color(0xFFFEF3C7), modifier = Modifier.fillMaxWidth()) {
    Text("Sin conexión. Mostrando la última información guardada.", color = Color(0xFF78350F), modifier = Modifier.padding(12.dp))
}

@Composable
private fun SectionTitle(text: String) = Text(
    text,
    style = MaterialTheme.typography.titleLarge,
    fontWeight = FontWeight.Bold,
    modifier = Modifier.semantics { heading() }.padding(vertical = 8.dp),
)

@Composable
private fun HomeScreen(data: Dashboard, openCourse: (Int) -> Unit, openCampus: () -> Unit) {
    LazyColumn(Modifier.fillMaxSize(), contentPadding = PaddingValues(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        item {
            Text("Hola, ${data.profile.firstName}", style = MaterialTheme.typography.headlineMedium, fontWeight = FontWeight.Bold)
        }
        if (data.profile.permissions.contains("campus:access")) {
            item {
                Button(onClick = openCampus, modifier = Modifier.fillMaxWidth().heightIn(min = 48.dp)) { Text("Entrar al Campus") }
            }
        } else {
            item { Text("Tus cursos aparecerán aquí cuando tu solicitud sea autorizada.") }
        }
        if (data.upcoming.isNotEmpty()) {
            item { SectionTitle("Próximas actividades") }
            items(data.upcoming.take(3), key = { "u${it.cmid}" }) { UpcomingCard(it, openCourse) }
        }
        if (data.courses.isNotEmpty()) {
            item { SectionTitle("Mis cursos") }
            items(data.courses, key = { "c${it.id}" }) { CourseCard(it, openCourse) }
        }
    }
}

@Composable
private fun UpcomingCard(activity: Activity, openCourse: (Int) -> Unit) {
    Card(Modifier.fillMaxWidth().clickable(enabled = activity.courseId != null) { activity.courseId?.let(openCourse) }) {
        Column(Modifier.padding(16.dp)) {
            Text(activity.name, fontWeight = FontWeight.SemiBold)
            Text("${activity.courseName ?: ""} · ${formatDate(activity.duedate)}", style = MaterialTheme.typography.bodySmall)
        }
    }
}

@Composable
private fun CourseCard(course: Course, open: (Int) -> Unit) {
    Card(Modifier.fillMaxWidth().clickable { open(course.id) }) {
        Column(Modifier.padding(16.dp)) {
            Text(course.shortname, style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.primary)
            Text(course.fullname, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold)
            Text("${course.activityCount} actividades", style = MaterialTheme.typography.bodySmall)
            if (course.progress >= 0) {
                Spacer(Modifier.height(8.dp))
                LinearProgressIndicator(progress = { course.progress / 100f }, modifier = Modifier.fillMaxWidth())
                Text("${course.progress}% completado", style = MaterialTheme.typography.bodySmall)
            }
        }
    }
}

@Composable
private fun CoursesScreen(courses: List<Course>, open: (Int) -> Unit) {
    if (courses.isEmpty()) {
        Box(Modifier.fillMaxSize().padding(24.dp), contentAlignment = Alignment.Center) { Text("Aún no tienes cursos asignados.") }
        return
    }
    LazyColumn(Modifier.fillMaxSize(), contentPadding = PaddingValues(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        items(courses, key = { it.id }) { CourseCard(it, open) }
    }
}

@Composable
private fun CourseScreen(course: Course, openCourse: () -> Unit, openActivity: (Int) -> Unit) {
    LazyColumn(Modifier.fillMaxSize(), contentPadding = PaddingValues(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
        item {
            Text(course.fullname, style = MaterialTheme.typography.headlineSmall, fontWeight = FontWeight.Bold)
            if (course.summary.isNotBlank()) Text(course.summary, modifier = Modifier.padding(top = 4.dp))
            Button(onClick = openCourse, modifier = Modifier.fillMaxWidth().padding(top = 12.dp).heightIn(min = 48.dp)) { Text("Abrir en el campus") }
        }
        course.sections.forEach { section ->
            item(key = "s${section.id}") { SectionTitle(section.name) }
            items(section.activities, key = { "a${it.cmid}" }) { activity ->
                Card(Modifier.fillMaxWidth().clickable { openActivity(activity.cmid) }) {
                    Row(Modifier.padding(16.dp), verticalAlignment = Alignment.CenterVertically) {
                        Column(Modifier.weight(1f)) {
                            Text(activity.name, fontWeight = FontWeight.SemiBold)
                            if (activity.duedate > 0) Text("Entrega: ${formatDate(activity.duedate)}", style = MaterialTheme.typography.bodySmall)
                        }
                        if (activity.completed) Icon(Icons.Default.CheckCircle, "Completada", tint = Color(0xFF15803D))
                    }
                }
            }
        }
    }
}

@Composable
private fun NoticesScreen(data: Dashboard, markRead: (String) -> Unit) {
    if (data.notices.isEmpty()) {
        Box(Modifier.fillMaxSize().padding(24.dp), contentAlignment = Alignment.Center) { Text("Sin avisos.") }
        return
    }
    LazyColumn(Modifier.fillMaxSize(), contentPadding = PaddingValues(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
        items(data.notices, key = { it.id }) { notice ->
            Card(Modifier.fillMaxWidth().clickable(enabled = notice.readAt == null) { markRead(notice.id) }) {
                Column(Modifier.padding(16.dp)) {
                    Text(notice.title, fontWeight = if (notice.readAt == null) FontWeight.Bold else FontWeight.Normal)
                    Text(notice.body, style = MaterialTheme.typography.bodyMedium)
                }
            }
        }
    }
}

@Composable
private fun ProfileScreen(app: IiniciaApp, data: Dashboard, onLogout: () -> Unit) {
    val context = androidx.compose.ui.platform.LocalContext.current
    var enabled by remember { mutableStateOf(app.repository.notificationsEnabled) }
    Column(Modifier.fillMaxSize().padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        Text("${data.profile.firstName} ${data.profile.lastName}", style = MaterialTheme.typography.headlineSmall, fontWeight = FontWeight.Bold)
        Text(data.profile.email)
        Text("Estado: ${data.profile.status}")
        Row(Modifier.fillMaxWidth().heightIn(min = 48.dp), verticalAlignment = Alignment.CenterVertically) {
            Text("Notificaciones", Modifier.weight(1f))
            Switch(checked = enabled, onCheckedChange = {
                enabled = it
                app.repository.notificationsEnabled = it
                if (it) NoticeWorker.schedule(context) else NoticeWorker.cancel(context)
            })
        }
        OutlinedButton(onClick = onLogout, modifier = Modifier.fillMaxWidth().heightIn(min = 48.dp)) { Text("Cerrar sesión") }
    }
}
