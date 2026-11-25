package org.iinicia.app.data.models

import kotlinx.serialization.Serializable

@Serializable
data class Profile(
    val id: String,
    val email: String,
    val firstName: String,
    val lastName: String,
    val phone: String? = null,
    val status: String,
    val roles: List<String> = emptyList(),
    val permissions: List<String> = emptyList(),
)

@Serializable
data class Activity(
    val cmid: Int,
    val name: String,
    val modname: String,
    val url: String = "",
    val duedate: Long = 0,
    val completed: Boolean = false,
    val courseId: Int? = null,
    val courseName: String? = null,
)

@Serializable
data class Section(val id: Int, val name: String, val activities: List<Activity> = emptyList())

@Serializable
data class Course(
    val id: Int,
    val fullname: String,
    val shortname: String,
    val summary: String = "",
    val progress: Int = -1,
    val activityCount: Int = 0,
    val sections: List<Section> = emptyList(),
)

@Serializable
data class Notice(
    val id: String,
    val title: String,
    val body: String,
    val link: String? = null,
    val readAt: String? = null,
    val createdAt: String,
)

@Serializable
data class CampusLink(val url: String)

@Serializable
data class Dashboard(
    val profile: Profile,
    val courses: List<Course>,
    val upcoming: List<Activity>,
    val notices: List<Notice>,
)
