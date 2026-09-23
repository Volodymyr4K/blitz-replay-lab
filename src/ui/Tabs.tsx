import { useRef, useState } from 'react'
import type { BattleSummary } from '../analysis/analyze'
import { mapName } from '../data/lookup'
import { useLang, type T } from '../i18n'
import { readRoster } from '../lib/excel'
import { date, duration, int } from '../lib/format'
import { toast } from '../lib/toast'
import { removeBattle, updateSession, type FileError } from '../store'
import { errorText, roomLabel } from '../lib/labels'
import { OutcomeTag, Panel } from './bits'

export function BattlesTab({
  battles,
  errors,
  t,
  editable,
  omitted,
}: {
  battles: BattleSummary[]
  errors: FileError[]
  t: T
  editable: boolean
  /** A shared link dropped the battle list to stay short. */
  omitted: boolean
}) {
  const lang = useLang()
  if (omitted) {
    return (
      <Panel>
        <p className="muted prose">{t('battlesOmitted')}</p>
      </Panel>
    )
  }
  const maps = new Map<string, { w: number; n: number }>()
  for (const b of battles) {
    const name = mapName(b.mapId, b.mapCode, lang)
    const m = maps.get(name) ?? { w: 0, n: 0 }
    m.n++
    if (b.outcome === 'win') m.w++
    maps.set(name, m)
  }
  return (
    <div className="stack">
      {maps.size > 1 && (
        <div className="map-chips">
          {[...maps].sort((a, b) => b[1].n - a[1].n).map(([name, m]) => (
            <span key={name} className="map-chip">
              {name} <b>{m.w}/{m.n}</b>
            </span>
          ))}
        </div>
      )}
      <div className="table-scroll">
        <table className="grid">
          <thead>
            <tr>
              <th className="left">{t('battleDate')}</th>
              <th className="left">{t('battleMap')}</th>
              <th>{t('battleResult')}</th>
              <th>{t('battleDamage')}</th>
              <th>{t('battleFrags')}</th>
              {editable && <th>{t('battleDuration')}</th>}
              <th className="left">{t('battleRoom')}</th>
              {editable && <th className="left">{t('battleAuthor')}</th>}
              {editable && <th />}
            </tr>
          </thead>
          <tbody>
            {battles.map((b) => (
              <tr key={b.id} className="static">
                <td className="left muted">{date(b.timestamp, lang)}</td>
                <td className="left">{mapName(b.mapId, b.mapCode, lang)}</td>
                <td>
                  <OutcomeTag outcome={b.outcome} t={t} />
                </td>
                <td>
                  <span className="our-text">{int(b.ourDamage)}</span> : <span className="enemy-text">{int(b.enemyDamage)}</span>
                </td>
                <td>
                  <span className="our-text">{b.ourFrags}</span> : <span className="enemy-text">{b.enemyFrags}</span>
                </td>
                {editable && <td className="muted">{duration(b.duration)}</td>}
                <td className="left muted">{roomLabel(b.roomType, t)}</td>
                {editable && (
                  <td className="left">
                    {b.authorNick}
                    {b.sideVia !== 'author' && (
                      <span className="hint-chip" title={t(b.sideVia === 'roster' ? 'viaRoster' : 'viaAnchor')}>
                        ⇄
                      </span>
                    )}
                  </td>
                )}
                {editable && (
                  <td>
                    <button className="btn sm ghost" onClick={() => removeBattle(b.id)} title={b.fileName}>
                      {t('remove')}
                    </button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {errors.length > 0 && (
        <Panel title={t('errorsTitle')} className="errors">
          <ul className="error-list">
            {errors.map((e, i) => (
              <li key={i}>
                <b>{e.file}</b> — {errorText(e.reason, t)}
              </li>
            ))}
          </ul>
        </Panel>
      )}
    </div>
  )
}

export function RosterTab({ roster, t }: { roster: string[]; t: T }) {
  const [text, setText] = useState(roster.join('\n'))
  const file = useRef<HTMLInputElement>(null)
  const dirty = text.trim() !== roster.join('\n').trim()

  const save = (value: string) => {
    const lines = value.split(/\r?\n/).map((l) => l.trim()).filter(Boolean)
    updateSession({ roster: lines })
    toast(t('rosterSaved'))
  }

  const onImport = async () => {
    const f = file.current?.files?.[0]
    if (!f) return
    file.current!.value = ''
    try {
      const names = await readRoster(f)
      const merged = [...new Set([...text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean), ...names])].join('\n')
      setText(merged)
      save(merged)
      toast(t('rosterImported', { n: names.length }))
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e), 'err')
    }
  }

  return (
    <Panel title={t('rosterTitle')} className="roster">
      <p className="muted prose">{t('rosterText')}</p>
      <textarea className="input roster-input" rows={10} placeholder={t('rosterPh')} value={text} onChange={(e) => setText(e.target.value)} spellCheck={false} />
      <div className="row-actions">
        <button className="btn primary" disabled={!dirty} onClick={() => save(text)}>
          {t('save')}
        </button>
        <input ref={file} type="file" accept=".xlsx,.csv,.txt" hidden onChange={onImport} />
        <button className="btn" onClick={() => file.current?.click()}>
          {t('rosterImport')}
        </button>
        {text && (
          <button
            className="btn ghost"
            onClick={() => {
              setText('')
              save('')
            }}
          >
            {t('rosterClear')}
          </button>
        )}
      </div>
    </Panel>
  )
}
