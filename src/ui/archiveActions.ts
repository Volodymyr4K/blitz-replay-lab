import { loadArchived, saveToArchive, type ArchiveMeta } from '../archive'
import { getLang, type Lang, type T } from '../i18n'
import { day } from '../lib/format'
import { toast } from '../lib/toast'
import { clearSession, getSession, restoreSession, updateSession } from '../store'

/** A user title, or "vs [CLAN] · 23 Sep" derived from the session. */
export function archiveTitle(m: ArchiveMeta, t: T, lang: Lang): string {
  if (m.title) return m.title
  const who = m.enemyClan ? t('archiveVsClan', { clan: m.enemyClan }) : t(m.mode === 'scrim' ? 'modeScrim' : 'modeIndividual')
  return `${who} · ${day(m.to || m.savedAt / 1000, lang)}`
}

/** Save the working session; later saves update the same archive entry. */
export async function archiveCurrent(t: T) {
  const meta = await saveToArchive(getSession())
  updateSession({ archiveId: meta.id })
  toast(t('archiveSaved'))
}

/** "New analysis": file the session away first, so starting over never loses anything. */
export async function archiveAndClear(t: T) {
  const session = getSession()
  if (!session.battles.length) {
    clearSession()
    return
  }
  const meta = await saveToArchive(session)
  const previous = { ...clearSession(), archiveId: meta.id }
  toast(t('archiveClearedSaved'), 'info', { label: t('undo'), run: () => restoreSession(previous) })
}

/** Load an archived session into the workspace, archiving whatever was open before. */
export async function openArchived(id: string, t: T) {
  const current = getSession()
  if (current.archiveId !== id) {
    if (current.battles.length) await saveToArchive(current)
    const entry = await loadArchived(id)
    if (!entry) return
    updateSession({ battles: entry.battles, roster: entry.roster, mode: entry.meta.mode, title: entry.meta.title, errors: [], archiveId: id })
    toast(t('archiveOpened', { title: archiveTitle(entry.meta, t, getLang()) }))
  }
  location.hash = '#/'
}
