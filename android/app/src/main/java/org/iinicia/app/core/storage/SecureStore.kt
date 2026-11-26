package org.iinicia.app.core.storage

import android.content.Context
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import androidx.core.content.edit
import java.security.KeyStore
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

/** Guarda valores cifrados con AES-GCM; la llave vive en Android Keystore y no es exportable. */
class SecureStore(context: Context) : KeyValueStore {
    private val prefs = context.getSharedPreferences("iinicia_secure", Context.MODE_PRIVATE)

    private fun key(): SecretKey {
        val keyStore = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
        (keyStore.getKey(ALIAS, null) as? SecretKey)?.let { return it }
        val generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore")
        generator.init(
            KeyGenParameterSpec.Builder(ALIAS, KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT)
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                .setKeySize(256)
                .build(),
        )
        return generator.generateKey()
    }

    @Synchronized
    override fun put(name: String, value: String?) {
        // A16 (Fase 5): escritura síncrona (commit). Con apply() la escritura era asíncrona y, si Android terminaba el
        // proceso justo después de renovar los tokens, el token nuevo podía no llegar a disco.
        if (value == null) {
            prefs.edit(commit = true) { remove(name) }
            return
        }
        val cipher = Cipher.getInstance(TRANSFORM).apply { init(Cipher.ENCRYPT_MODE, key()) }
        val data = cipher.iv + cipher.doFinal(value.toByteArray())
        prefs.edit(commit = true) { putString(name, Base64.encodeToString(data, Base64.NO_WRAP)) }
    }

    @Synchronized
    override fun get(name: String): String? {
        val encoded = prefs.getString(name, null) ?: return null
        return try {
            val data = Base64.decode(encoded, Base64.NO_WRAP)
            val cipher = Cipher.getInstance(TRANSFORM)
            cipher.init(Cipher.DECRYPT_MODE, key(), GCMParameterSpec(128, data, 0, IV_SIZE))
            String(cipher.doFinal(data, IV_SIZE, data.size - IV_SIZE))
        } catch (_: Exception) {
            prefs.edit(commit = true) { remove(name) }
            null
        }
    }

    @Synchronized
    override fun clear() = prefs.edit(commit = true) { clear() }

    private companion object {
        const val ALIAS = "iinicia_session_key"
        const val TRANSFORM = "AES/GCM/NoPadding"
        const val IV_SIZE = 12
    }
}
