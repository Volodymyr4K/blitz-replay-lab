import { loadArchived, newArchiveId, saveToArchive, type ArchiveMeta } from '../archive'
import { getLang, type Lang, type T } from '../i18n'
import { day } from '../lib/format'
import { toast } from '../lib/toast'
import { clearSession, getSession, restoreSession, updateSession, type Session } from '../store'

/** A user title, or "vs [CLAN] · 23 Sep" derived from the session. */
export function archiveTitle(m: ArchiveMeta, t: T, lang: Lang): string {
  if (m.title) return m.title
  const who = m.enemyClan ? t('archiveVsClan', { clan: m.enemyClan }) : t(m.mode === 'scrim' ? 'modeScrim' : 'modeIndividual')
  return `${who} · ${day(m.to || m.savedAt / 1000, lang)}`
}

/**
 * One archive action at a time: a double click must not save twice or clear twice.
 * The archive ID is assigned before the first await, so even a racing save lands on
 * the same entry instead of creating a duplicate.
 */
let busy = false

async function guarded(t: T, action: () => Promise<void>) {
  if (busy) return
  busy = true
  try {
    await action()
  } catch (e) {
    console.error(e)
    toast(t('archiveFailed'), 'err')
  } finally {
    busy = false
  }
}

function withArchiveId(): Session & { archiveId: string } {
  const current = getSession()
  if (current.archiveId) return current as Session & { archiveId: string }
  updateSession({ archiveId: newArchiveId() })
  return getSession() as Session & { archiveId: string }
}

/** Save the working session; later saves update the same archive entry. */
export const archiveCurrent = (t: T) =>
  guarded(t, async () => {
    await saveToArchive(withArchiveId())
    toast(t('archiveSaved'))
  })

/** "New analysis": file the session away first, so starting over never loses anything. */
export const archiveAndClear = (t: T) =>
  guarded(t, async () => {
    if (!getSession().battles.length) {
      clearSession()
      return
    }
    // If saving fails this throws before anything is cleared.
    await saveToArchive(withArchiveId())
    const previous = clearSession()
    toast(t('archiveClearedSaved'), 'info', { label: t('undo'), run: () => restoreSession(previous) })
  })

/** Load an archived session into the workspace, archiving whatever was open before. */
export const openArchived = (id: string, t: T) =>
  guarded(t, async () => {
    if (getSession().archiveId !== id) {
      if (getSession().battles.length) await saveToArchive(withArchiveId())
      const entry = await loadArchived(id)
      if (!entry) throw new Error('archive entry missing')
      // The roster is the clan's setup, not part of one session: keep the current one and fall
      // back to the saved snapshot only when none is set, so opening an old scrim never undoes edits.
      const roster = getSession().roster.length ? getSession().roster : entry.roster
      updateSession({ battles: entry.battles, roster, mode: entry.meta.mode, title: entry.meta.title, errors: [], archiveId: id })
      toast(t('archiveOpened', { title: archiveTitle(entry.meta, t, getLang()) }))
    }
    location.hash = '#/'
  })
