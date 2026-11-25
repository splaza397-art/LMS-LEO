package org.iinicia.app.core.network

import kotlinx.coroutines.suspendCancellableCoroutine
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.jsonPrimitive
import okhttp3.Call
import okhttp3.Callback
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import okhttp3.Response
import org.iinicia.app.core.security.Session
import org.iinicia.app.core.security.SessionExpiredException
import java.io.IOException
import java.util.concurrent.TimeUnit
import kotlin.coroutines.resume
import kotlin.coroutines.resumeWithException

/**
 * Cliente del backend IINICIA (/api/v1). La app nunca contiene ni recibe tokens de Moodle.
 * - Cada solicitud lleva el token vigente de la sesión; un 401 cierra la sesión local.
 * - Si la corrutina se cancela (la pantalla se cerró), la solicitud HTTP también se cancela.
 * - Sin reintentos propios. OkHttp solo reabre una conexión vieja que falló antes de recibir respuesta; la única
 *   escritura de la app (marcar un aviso como leído) es idempotente.
 */
class ApiClient(
    private val session: Session,
    private val baseUrl: String,
    private val http: OkHttpClient = defaultHttpClient(),
) {
    val json: Json = AppJson

    suspend fun request(path: String, method: String = "GET", body: String? = null): String {
        val token = session.accessToken()
        val requestBody = body?.toRequestBody(JSON_TYPE) ?: if (method == "GET") null else ByteArray(0).toRequestBody()
        val request = Request.Builder()
            .url("$baseUrl/$path")
            .header("Authorization", "Bearer $token")
            .header("Accept", "application/json")
            .method(method, requestBody)
            .build()
        val (code, text) = try {
            http.newCall(request).await().use { it.code to it.body.string() }
        } catch (e: IOException) {
            throw AppError.fromIo(e)
        }
        return when {
            code in 200..299 -> text
            code == 401 -> throw SessionExpiredException()
            else -> throw AppError.fromStatus(code, backendMessage(text))
        }
    }

    suspend inline fun <reified T> get(path: String): T = json.decodeFromString(request(path))

    /** Mensaje de error de NestJS: {"message": "..."} o {"message": ["...", "..."]}. */
    private fun backendMessage(text: String): String? = runCatching {
        when (val message = (json.parseToJsonElement(text) as? JsonObject)?.get("message")) {
            is JsonPrimitive -> message.content
            is JsonArray -> message.joinToString(". ") { it.jsonPrimitive.content }
            else -> null
        }
    }.getOrNull()?.takeIf { it.isNotBlank() }

    companion object {
        private val JSON_TYPE = "application/json".toMediaType()

        /** 30 s de lectura: suficiente para el primer acceso a Moodle tras reiniciarlo (17 a 19 s medidos en la Fase 3). */
        fun defaultHttpClient(): OkHttpClient = OkHttpClient.Builder()
            .connectTimeout(15, TimeUnit.SECONDS)
            .readTimeout(30, TimeUnit.SECONDS)
            .build()
    }
}

/** Ejecuta la llamada sin bloquear un hilo y la cancela si la corrutina se cancela. */
private suspend fun Call.await(): Response = suspendCancellableCoroutine { cont ->
    cont.invokeOnCancellation { cancel() }
    enqueue(object : Callback {
        override fun onResponse(call: Call, response: Response) = cont.resume(response) { _, value, _ -> value.close() }
        override fun onFailure(call: Call, e: IOException) {
            if (!cont.isCancelled) cont.resumeWithException(e)
        }
    })
}
