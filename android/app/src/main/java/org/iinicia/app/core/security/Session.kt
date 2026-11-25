package org.iinicia.app.core.security

import android.content.Intent
import kotlinx.coroutines.flow.StateFlow

class SessionExpiredException : Exception("La sesión expiró")

/** Lo que la capa de datos necesita de la sesión: un token vigente y poder cerrarla localmente. */
interface Session {
    val signedIn: StateFlow<Boolean>

    /** Token de acceso vigente; se renueva si hace falta. Lanza SessionExpiredException si ya no hay sesión. */
    suspend fun accessToken(): String

    /** Borra la sesión local: tokens y todo lo guardado en el almacén cifrado. */
    suspend fun clearSession()
}

/** Inicio y cierre de sesión con Keycloak. AuthManager lo implementa; las pruebas de interfaz usan un doble. */
interface Authenticator : Session {
    fun loginIntent(): Intent
    suspend fun completeLogin(data: Intent)

    /** Revoca y borra la sesión local; devuelve el intent de cierre en Keycloak, si hay token de identidad. */
    suspend fun logoutIntent(): Intent?
}
