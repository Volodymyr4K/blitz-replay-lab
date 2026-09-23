import { useEffect, useRef, useState } from 'react'
import { playerForm, type PlayerForm } from '../analysis/form'
import { deleteArchived, exportArchive, importArchive, loadAll, maintainArchive, restoreArchived, useArchive, type ArchiveMeta } from '../archive'
import { useLang, type Lang, type T } from '../i18n'
import { fixed, int, pct } from '../lib/format'
import { toast } from '../lib/toast'
import { getSession, updateSession, useStore } from '../store'
import { archiveTitle, openArchived } from './archiveActions'
import { Bpr, Clan, Panel } from './bits'

function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export function ArchivePage({ t }: { t: T }) {
  const lang = useLang()
  const { index, loaded } = useArchive()
  const [tab, setTab] = useState<'sessions' | 'form'>('sessions')
  const file = useRef<HTMLInputElement>(null)

  useEffect(() => {
    maintainArchive().catch((e) => console.error(e))
  }, [])

  const onExport = async () => {
    download(await exportArchive(), `blitz-archive-${new Date().toISOString().slice(0, 10)}.json`)
  }

  const onImport = async () => {
    const f = file.current?.files?.[0]
    if (!f) return
    file.current!.value = ''
    try {
      const r = await importArchive(await f.text())
      toast(t('archiveImported', { n: r.added }), r.added ? 'ok' : 'info')
      if (r.skipped) toast(t('archiveImportSkipped', { n: r.skipped }), 'info')
      if (r.invalid) toast(t('archiveImportInvalid', { n: r.invalid }), 'err')
    } catch {
      toast(t('archiveBadFile'), 'err')
    }
  }

  return (
    <div className="archive">
      <header className="archive-head">
        <div>
          <h1>{t('archiveTitle')}</h1>
          <p className="muted">{t('archiveIntro')}</p>
        </div>
        <div className="row-actions">
          <button className="btn" onClick={onExport} disabled={!index.length}>
            {t('archiveExport')}
          </button>
          <input ref={file} type="file" accept=".json,application/json" hidden onChange={onImport} />
          <button className="btn" onClick={() => file.current?.click()}>
            {t('archiveImport')}
          </button>
        </div>
      </header>

      <nav className="tabs" role="tablist">
        {(['sessions', 'form'] as const).map((id) => (
          <button key={id} role="tab" aria-selected={tab === id} className={tab === id ? 'on' : ''} onClick={() => setTab(id)}>
            {t(id === 'sessions' ? 'archiveSessionsTab' : 'archiveFormTab')}
            {id === 'sessions' && <span className="count">{index.length}</span>}
          </button>
        ))}
      </nav>

      {tab === 'sessions' && loaded && (index.length ? <SessionList index={index} t={t} lang={lang} /> : <Panel><p className="muted prose">{t('archiveEmpty')}</p></Panel>)}
      {tab === 'form' && <FormView index={index} t={t} />}
    </div>
  )
}

function SessionList({ index, t, lang }: { index: ArchiveMeta[]; t: T; lang: Lang }) {
  const { session } = useStore()

  const remove = async (m: ArchiveMeta) => {
    const entry = await deleteArchived(m.id)
    const wasOpen = getSession().archiveId === m.id
    if (wasOpen) updateSession({ archiveId: null })
    if (!entry) return
    toast(t('archiveDeleted', { title: archiveTitle(m, t, lang) }), 'info', {
      label: t('undo'),
      run: async () => {
        await restoreArchived(entry)
        if (wasOpen) updateSession({ archiveId: m.id })
      },
    })
  }

  return (
    <ul className="archive-list">
      {index.map((m) => {
        const total = m.record.win + m.record.loss + m.record.draw
        const isOpen = session.archiveId === m.id
        return (
          <li key={m.id} className={isOpen ? 'current' : ''}>
            <div className="archive-main">
              <h2>
                {archiveTitle(m, t, lang)}
                {isOpen && <span className="hint-chip">{t('archiveCurrent')}</span>}
              </h2>
              <p className="muted small">
                {t(m.mode === 'scrim' ? 'modeScrim' : 'modeIndividual')} · {t('battlesN', { n: m.battles })} · {m.record.win}–{m.record.loss}–{m.record.draw}
                {total > 0 && ` (${pct(m.record.win / total)})`}
                {m.mvp && ` · MVP ${m.mvp}`}
              </p>
            </div>
            <Bpr value={m.ourAvgBpr} size="sm" />
            <div className="archive-actions">
              <button className="btn sm primary" onClick={() => openArchived(m.id, t)}>
                {t('archiveOpen')}
              </button>
              <button className="btn sm ghost" onClick={() => remove(m)}>
                {t('archiveDelete')}
              </button>
            </div>
          </li>
        )
      })}
    </ul>
  )
}

function FormView({ index, t }: { index: ArchiveMeta[]; t: T }) {
  const [rows, setRows] = useState<PlayerForm[] | null>(null)
  // null = not chosen yet: filter to regulars only when there are any.
  const [regularsChoice, setRegulars] = useState<boolean | null>(null)

  useEffect(() => {
    let live = true
    // Any save, delete or import produces a new index, so the form follows every change.
    loadAll().then((all) => live && setRows(playerForm(all)))
    return () => {
      live = false
    }
  }, [index])

  if (!rows) return null
  if (index.length < 2 || !rows.length) return <Panel><p className="muted prose">{t('formEmpty')}</p></Panel>
  const hasRegulars = rows.some((r) => r.points.length >= 2)
  const regulars = regularsChoice ?? hasRegulars
  const shown = regulars ? rows.filter((r) => r.points.length >= 2) : rows

  return (
    <div className="stack">
      <p className="muted prose">{t('formIntro')}</p>
      <label className="check">
        <input type="checkbox" checked={regulars} onChange={(e) => setRegulars(e.target.checked)} />
        {t('formRegularsOnly')}
      </label>
      {!shown.length && <p className="muted">{t('formNoRegulars')}</p>}
      <div className="table-scroll">
        <table className="grid">
          <thead>
            <tr>
              <th className="left">{t('colPlayer')}</th>
              <th>{t('colSessions')}</th>
              <th>{t('colBattles')}</th>
              <th>{t('colBpr')}</th>
              <th>{t('colAdr')}</th>
              <th>{t('colLast')}</th>
              <th>{t('colChange')}</th>
              <th className="left">{t('colTrend')}</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((r) => {
              const last = r.points[r.points.length - 1]
              return (
                <tr key={r.id} className="static">
                  <td className="left">
                    <span className="nick">{r.nick}</span> <Clan tag={r.clan} />
                  </td>
                  <td>{r.points.length}</td>
                  <td>{r.battles}</td>
                  <td>
                    <Bpr value={r.bpr} size="sm" />
                  </td>
                  <td>{int(r.adr)}</td>
                  <td>{fixed(last.bpr)}</td>
                  <td>{r.delta === null ? '—' : <span className={r.delta >= 0 ? 'our-text' : 'enemy-text'}>{`${r.delta >= 0 ? '▲' : '▼'} ${fixed(Math.abs(r.delta))}`}</span>}</td>
                  <td className="left">
                    <Spark values={r.points.map((p) => p.bpr)} />
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

/** Tiny BPR-per-session line; the dashed mid line marks 1.00. */
function Spark({ values }: { values: number[] }) {
  if (values.length < 2) return <span className="muted">—</span>
  const w = 96
  const h = 24
  const lo = Math.min(0.4, ...values)
  const hi = Math.max(1.6, ...values)
  const x = (i: number) => (i / (values.length - 1)) * (w - 4) + 2
  const y = (v: number) => h - 2 - ((v - lo) / (hi - lo)) * (h - 4)
  return (
    <svg className="spark" width={w} height={h} viewBox={`0 0 ${w} ${h}`} aria-hidden="true">
      <line x1={0} x2={w} y1={y(1)} y2={y(1)} className="spark-ref" />
      <polyline points={values.map((v, i) => `${x(i)},${y(v)}`).join(' ')} className="spark-line" />
      <circle cx={x(values.length - 1)} cy={y(values[values.length - 1])} r={2.5} className="spark-dot" />
    </svg>
  )
}
