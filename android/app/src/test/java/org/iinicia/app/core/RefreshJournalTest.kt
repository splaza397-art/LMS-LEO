package org.iinicia.app.core

import org.iinicia.app.core.security.RefreshJournal
import org.iinicia.app.core.storage.MemoryStore
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/** A16 (Fase 5): la renovación interrumpida se detecta en el siguiente arranque, y solo entonces. */
class RefreshJournalTest {
    private val store = MemoryStore()

    @Test fun `una renovacion terminada no deja rastro`() {
        val journal = RefreshJournal(store)
        journal.begin()
        journal.end()
        assertFalse(RefreshJournal(store).interrupted)
    }

    @Test fun `una renovacion sin terminar se ve desde un proceso nuevo`() {
        RefreshJournal(store).begin() // el proceso muere aquí, antes de guardar el token nuevo
        assertTrue(RefreshJournal(store).interrupted)
    }

    @Test fun `cerrar sesion borra el registro junto con la sesion`() {
        RefreshJournal(store).begin()
        store.clear()
        assertFalse(RefreshJournal(store).interrupted)
    }
}
