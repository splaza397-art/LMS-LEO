package org.iinicia.app.data.repositories

import org.iinicia.app.core.storage.KeyValueStore
import org.iinicia.app.core.storage.MemoryStore
import org.iinicia.app.data.remote.IiniciaApi
import java.security.MessageDigest
import java.security.SecureRandom
import java.util.Base64

/** Lo que Moodle devuelve a la app (iinicia://campus?bind=…&state=…&courseId|cmid=…). */
data class CampusCallback(val state: String?, val bind: String?, val courseId: Int?, val cmid: Int?)

/** La vuelta desde Moodle no corresponde a una entrada al campus iniciada en esta app por esta cuenta. */
class CampusFlowException : Exception("No se pudo abrir el campus. Vuelve a intentarlo desde la app.")

/**
 * Entrada al campus desde la app (Fase 4.11), en dos pasos como el parámetro state de OAuth:
 * 1. start(): el backend da el enlace al paso "start" de Moodle; la app le agrega un state aleatorio propio y lo guarda
 *    cifrado, con su dueño y 5 minutos de vida. Moodle pone una cookie de vinculación en el navegador y vuelve a la app.
 * 2. complete(): solo si el state es el guardado (una vez, sin vencer, de la misma cuenta) la app pide al backend el
 *    comprobante vinculado a ese navegador y lo abre en el mismo navegador. Una página ajena que abra
 *    iinicia://campus no consigue nada: no conoce el state.
 * Así el enlace con comprobante solo sirve en el navegador de este teléfono, nunca copiado a otro.
 */
class CampusLinks(
    private val api: IiniciaApi,
    private val store: KeyValueStore = MemoryStore(),
    private val owner: () -> String? = { null },
    private val clock: () -> Long = System::currentTimeMillis,
    private val random: SecureRandom = SecureRandom(),
) {
    suspend fun start(courseId: Int? = null, cmid: Int? = null): String {
        val url = api.campusLink(courseId, cmid)
        val state = ByteArray(24).also(random::nextBytes).let { Base64.getUrlEncoder().withoutPadding().encodeToString(it) }
        store.put(KEY, listOf(state, (clock() + TTL_MS).toString(), owner().orEmpty()).joinToString("|"))
        return url + (if ('?' in url) "&" else "?") + "client=app&state=$state"
    }

    suspend fun complete(callback: CampusCallback): String {
        val pending = store.get(KEY)?.split("|")
        store.put(KEY, null) // un solo uso, también si falla
        val expected = pending?.getOrNull(0)
        val until = pending?.getOrNull(1)?.toLongOrNull()
        val matches = expected != null && callback.state != null &&
            MessageDigest.isEqual(expected.toByteArray(), callback.state.toByteArray())
        if (!matches || until == null || clock() > until || pending.getOrNull(2).orEmpty() != owner().orEmpty()) throw CampusFlowException()
        val bind = callback.bind?.takeIf { BIND.matches(it) } ?: throw CampusFlowException()
        return api.campusLink(callback.courseId, callback.cmid, bind)
    }

    private companion object {
        const val KEY = "campus_state"
        const val TTL_MS = 5 * 60_000L
        val BIND = Regex("^[A-Za-z0-9_-]{43}$")
    }
}
