package org.iinicia.app.features.profile

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import org.iinicia.app.core.common.ScreenState
import org.iinicia.app.core.common.loadFrom
import org.iinicia.app.core.security.Session
import org.iinicia.app.data.models.Profile
import org.iinicia.app.data.repositories.ProfileRepository
import org.iinicia.app.data.repositories.SettingsRepository
import org.iinicia.app.features.notifications.NoticeScheduler

class ProfileViewModel(
    private val profiles: ProfileRepository,
    private val settings: SettingsRepository,
    private val scheduler: NoticeScheduler,
    private val session: Session,
) : ViewModel() {
    private val _state = MutableStateFlow(ScreenState<Profile>())
    val state: StateFlow<ScreenState<Profile>> = _state.asStateFlow()
    private val _notificationsEnabled = MutableStateFlow(settings.notificationsEnabled)
    val notificationsEnabled: StateFlow<Boolean> = _notificationsEnabled.asStateFlow()
    private var loading: Job? = null

    init { refresh(force = false) }

    fun refresh(force: Boolean = true) {
        loading?.cancel()
        loading = viewModelScope.launch { _state.loadFrom(session) { profiles.load(force) } }
    }

    fun setNotificationsEnabled(enabled: Boolean) {
        settings.notificationsEnabled = enabled
        _notificationsEnabled.value = enabled
        if (enabled) scheduler.schedule() else scheduler.cancel()
    }
}
