package org.iinicia.app.features.notifications

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.Card
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import org.iinicia.app.data.models.Notice
import org.iinicia.app.ui.components.EmptyState
import org.iinicia.app.ui.components.ScreenContent

@Composable
fun NotificationsScreen(viewModel: NotificationsViewModel) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    ScreenContent(state, onRefresh = viewModel::refresh) { notices -> NoticeList(notices, viewModel::markRead) }
}

@Composable
fun NoticeList(notices: List<Notice>, markRead: (String) -> Unit) {
    if (notices.isEmpty()) return EmptyState("Sin avisos.")
    LazyColumn(Modifier.fillMaxSize(), contentPadding = PaddingValues(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
        items(notices, key = { it.id }) { notice ->
            Card(Modifier.fillMaxWidth().clickable(enabled = notice.readAt == null) { markRead(notice.id) }) {
                Column(Modifier.padding(16.dp)) {
                    Text(notice.title, fontWeight = if (notice.readAt == null) FontWeight.Bold else FontWeight.Normal)
                    Text(notice.body, style = MaterialTheme.typography.bodyMedium)
                }
            }
        }
    }
}
