package org.iinicia.app.data

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.json.Json
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.iinicia.app.BuildConfig
import org.iinicia.app.auth.AuthManager
import org.iinicia.app.auth.SessionExpiredException
import java.util.concurrent.TimeUnit

class ApiException(val code: Int, message: String) : Exception(message)

/** Solo habla con el backend IINICIA: la app nunca contiene ni recibe tokens de Moodle. */
class ApiClient(private val auth: AuthManager) {
    val json = Json { ignoreUnknownKeys = true; coerceInputValues = true; explicitNulls = false }
    private val http = OkHttpClient.Builder()
        .connectTimeout(15, TimeUnit.SECONDS)
        .readTimeout(30, TimeUnit.SECONDS)
        .build()

    suspend fun request(path: String, method: String = "GET", body: String? = null): String {
        val token = auth.accessToken()
        return withContext(Dispatchers.IO) {
            val requestBody = body?.toRequestBody("application/json".toMediaType())
                ?: if (method == "GET") null else ByteArray(0).toRequestBody()
            val request = Request.Builder()
                .url("${BuildConfig.API_URL}/$path")
                .header("Authorization", "Bearer $token")
                .method(method, requestBody)
                .build()
            http.newCall(request).execute().use { response ->
                val text = response.body.string()
                when {
                    response.isSuccessful -> text
                    response.code == 401 -> throw SessionExpiredException()
                    response.code == 403 -> throw ApiException(403, "No tienes permiso para esta acción")
                    response.code == 404 -> throw ApiException(404, "Contenido no disponible")
                    else -> throw ApiException(response.code, "El servicio no está disponible")
                }
            }
        }
    }

    suspend inline fun <reified T> get(path: String): T = json.decodeFromString(request(path))
}
