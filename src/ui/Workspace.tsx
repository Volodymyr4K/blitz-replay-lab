import { useMemo, useState, type ReactNode } from 'react'
import { focusPlayer, mvp, playerBattles, toRow, type Analysis, type PlayerRow, type PlayerSums, type StoredBattle } from '../analysis/analyze'
import { encodeReport, type Mode } from '../analysis/share'
import { tankInfo } from '../data/lookup'
import type { T } from '../i18n'
import { exportExcel } from '../lib/excel'
import { fixed, int, pct } from '../lib/format'
import { toast } from '../lib/toast'
import { clearSession, updateSession, type FileError } from '../store'
import { Bpr, Clan, Panel } from './bits'
import { BprTrend, ClassMix, CompareRow, TopPlayers } from './charts'
import { Dropzone } from './Dropzone'
import { PlayerModal } from './PlayerModal'
import { BattlesTab, RosterTab } from './Tabs'
import { TeamTable } from './TeamTable'

type Tab = 'overview' | 'our' | 'enemy' | 'battles' | 'roster'

interface Props {
  analysis: Analysis
  mode: Mode
  title: string
  t: T
  /** Present for a local session; absent for a shared report. */
  local?: { battles: StoredBattle[]; errors: FileError[]; roster: string[] }
}

/** Merge a team's raw sums into one pseudo-player so accuracy etc. are computed from totals. */
function teamTotals(rows: PlayerRow[]): PlayerRow {
  const s: PlayerSums = { id: 0, nick: '', clan: null, side: 'our', battles: 0, wins: 0, damage: 0, frags: 0, shots: 0, hits: 0, pens: 0, assist: 0, blocked: 0, enemiesDamaged: 0, iPoints: 0, sPoints: 0, hitsReceived: 0, xp: 0, tanks: {} }
  for (const r of rows) {
    for (const k of ['battles', 'wins', 'damage', 'frags', 'shots', 'hits', 'pens', 'assist', 'blocked', 'enemiesDamaged', 'iPoints', 'sPoints', 'hitsReceived', 'xp'] as const) s[k] += r[k]
  }
  return toRow(s)
}

function buildSummary(a: Analysis, mode: Mode, t: T): string[] {
  const lines: string[] = []
  const total = a.record.win + a.record.loss + a.record.draw
  const focus = focusPlayer(a)
  if (mode === 'individual' && focus) {
    lines.push(t('sumYou', { nick: focus.nick, bpr: fixed(focus.bpr), adr: int(focus.adr), kpr: fixed(focus.kpr), n: focus.battles }))
    lines.push(t('sumNext', { adr: int(Math.ceil((focus.adr * 1.08) / 50) * 50), h: fixed(focus.accH * 100, 0), p: fixed(focus.accP * 100, 0) }))
    lines.push(focus.support < focus.firepower ? t('sumSupport') : t('sumDamage'))
  } else {
    const diff = a.ourAvgBpr - a.enemyAvgBpr
    lines.push(diff >= 0 ? t('sumEdge', { v: fixed(diff) }) : t('sumGap', { v: fixed(-diff) }))
    const dmg = a.ourAvgAdr - a.enemyAvgAdr
    lines.push(dmg >= 0 ? t('sumDmgAhead', { v: int(dmg) }) : t('sumDmgBehind', { v: int(-dmg) }))
    const best = mvp(a)
    if (best) lines.push(t('sumMvp', { nick: best.nick, bpr: fixed(best.bpr), adr: int(best.adr), tank: best.mainTank }))
    lines.push(diff >= 0 ? t('sumFocusStructure') : t('sumFocusFire'))
  }
  if (total) lines.push(t('sumRecord', { w: a.record.win, l: a.record.loss, d: a.record.draw, wr: pct(a.record.win / total) }))
  return lines
}

export function Workspace({ analysis: a, mode, title, t, local }: Props) {
  const [tab, setTab] = useState<Tab>('overview')
  const [open, setOpen] = useState<PlayerRow | null>(null)
  const total = a.record.win + a.record.loss + a.record.draw
  const summary = useMemo(() => buildSummary(a, mode, t), [a, mode, t])
  const ourT = useMemo(() => teamTotals(a.our), [a.our])
  const enemyT = useMemo(() => teamTotals(a.enemy), [a.enemy])
  const all = useMemo(() => [...a.our, ...a.enemy].sort((x, y) => y.bpr - x.bpr), [a])
  const focus = focusPlayer(a)
  const best = mvp(a)
  const opts = { roster: local?.roster ?? [] }
  const modalBattles = open && local ? playerBattles(local.battles, open.id, open.side, opts) : null
  const focusBattles = mode === 'individual' && focus && local ? playerBattles(local.battles, focus.id, 'our', opts) : null

  const [shareUrl, setShareUrl] = useState<string | null>(null)
  const share = async () => {
    const url = `${location.origin}${location.pathname}#/s/${encodeReport(a, mode, title)}`
    setShareUrl(url)
    try {
      await navigator.clipboard.writeText(url)
      toast(t('shareCopied'))
    } catch {
      /* the dialog still shows the link */
    }
  }

  const tabs: [Tab, string, number?][] = [
    ['overview', t('tabOverview')],
    ['our', t('tabOur'), a.our.length],
    ['enemy', t('tabEnemy'), a.enemy.length],
    ['battles', t('tabBattles'), a.battles.length],
  ]
  if (local) tabs.push(['roster', t('tabRoster'), local.roster.length || undefined])

  return (
    <div className="workspace">
      {local && (
        <div className="toolbar">
          <input className="input title-input" aria-label={t('sessionTitle')} placeholder={t('sessionTitlePh')} value={title} onChange={(e) => updateSession({ title: e.target.value })} />
          <div className="segmented" role="radiogroup" title={t('modeHint')}>
            {(['scrim', 'individual'] as const).map((m) => (
              <button key={m} role="radio" aria-checked={mode === m} className={mode === m ? 'on' : ''} onClick={() => updateSession({ mode: m })}>
                {m === 'scrim' ? t('modeScrim') : t('modeIndividual')}
              </button>
            ))}
          </div>
          <div className="toolbar-actions">
            <button className="btn primary" onClick={share}>
              {t('share')}
            </button>
            <button
              className="btn"
              onClick={async () => {
                await exportExcel(a, title)
                toast(t('exportDone'))
              }}
            >
              {t('exportXlsx')}
            </button>
            <button className="btn ghost" onClick={() => confirm(t('confirmClear')) && clearSession()}>
              {t('newAnalysis')}
            </button>
          </div>
        </div>
      )}

      {local && <Dropzone compact />}

      <div className="stat-strip">
        <Stat label={t('statRecord')} value={`${a.record.win}–${a.record.loss}–${a.record.draw}`} sub={`${t('statBattles')}: ${total}`} />
        <Stat label={t('statWinRate')} value={total ? pct(a.record.win / total) : '—'} />
        <Stat label={t('statOurBpr')} value={<Bpr value={a.ourAvgBpr} />} />
        <Stat label={t('statEnemyBpr')} value={<Bpr value={a.enemyAvgBpr} />} />
        <Stat label={t('statAdr')} value={<><span className="our-text">{int(ourT.adr)}</span><span className="muted"> : </span><span className="enemy-text">{int(enemyT.adr)}</span></>} />
        {best && <Stat label={t('statMvp')} value={best.nick} sub={`BPR ${fixed(best.bpr)}`} onClick={() => setOpen(best)} />}
        {!!local?.errors.length && <Stat label={t('statErrors')} value={String(local.errors.length)} tone="bad" onClick={() => setTab('battles')} />}
      </div>

      <nav className="tabs" role="tablist">
        {tabs.map(([id, label, count]) => (
          <button key={id} role="tab" aria-selected={tab === id} className={tab === id ? 'on' : ''} onClick={() => setTab(id)}>
            {label}
            {count !== undefined && <span className="count">{count}</span>}
          </button>
        ))}
      </nav>

      {tab === 'overview' && (
        <div className="overview">
          {mode === 'individual' && focus && (
            <Panel className="focus" title={t('focusPlayer')}>
              <div className="focus-head" onClick={() => setOpen(focus)}>
                <Bpr value={focus.bpr} size="lg" />
                <div>
                  <h2>
                    {focus.nick} <Clan tag={focus.clan} />
                  </h2>
                  <p className="muted">
                    {t('colBattles')}: {focus.battles} · {t('colWr')} {pct(focus.winRate)} · {focus.mainTank}
                  </p>
                </div>
              </div>
              <div className="kpis">
                {[
                  [t('colAdr'), int(focus.adr)],
                  [t('colKpr'), fixed(focus.kpr)],
                  [t('colAssist'), int(focus.assistAvg)],
                  [t('colBlocked'), int(focus.blockedAvg)],
                  [t('colAccH'), pct(focus.accH)],
                  [t('colAccP'), pct(focus.accP)],
                ].map(([l, v]) => (
                  <div className="kpi" key={l}>
                    <span>{l}</span>
                    <b>{v}</b>
                  </div>
                ))}
              </div>
              {focusBattles && focusBattles.length > 1 && (
                <>
                  <h4>{t('bprTrend')}</h4>
                  <BprTrend points={focusBattles.map((b) => ({ v: b.row.bpr, outcome: b.outcome }))} />
                </>
              )}
              <h4>{t('byTank')}</h4>
              <div className="tank-list">
                {Object.entries(focus.tanks)
                  .sort((x, y) => y[1].battles - x[1].battles)
                  .slice(0, 6)
                  .map(([id, s]) => (
                    <div key={id} className="tank-line">
                      <span>{tankInfo(Number(id)).name}</span>
                      <span className="muted">
                        {s.battles}× · {int(s.damage / s.battles)} · {pct(s.wins / s.battles)}
                      </span>
                    </div>
                  ))}
              </div>
            </Panel>
          )}

          <div className="versus">
            <TeamColumn rows={a.our} side="our" title={t('ourTeam')} avg={a.ourAvgBpr} t={t} onOpen={setOpen} />
            <div className="vs-badge">{t('vs')}</div>
            <TeamColumn rows={a.enemy} side="enemy" title={t('enemyTeam')} avg={a.enemyAvgBpr} t={t} onOpen={setOpen} />
          </div>

          <div className="overview-grid">
            <Panel title={t('teamCompare')}>
              <div className="compare">
                <CompareRow label="BPR" our={a.ourAvgBpr} enemy={a.enemyAvgBpr} format={(v) => fixed(v)} />
                <CompareRow label={t('colAdr')} our={ourT.adr} enemy={enemyT.adr} format={int} />
                <CompareRow label={t('colKpr')} our={ourT.kpr} enemy={enemyT.kpr} format={(v) => fixed(v)} />
                <CompareRow label={t('colAccH')} our={ourT.accH} enemy={enemyT.accH} format={(v) => pct(v)} />
                <CompareRow label={t('colAccP')} our={ourT.accP} enemy={enemyT.accP} format={(v) => pct(v)} />
                <CompareRow label={t('colAssist')} our={ourT.assistAvg} enemy={enemyT.assistAvg} format={int} />
                <CompareRow label={t('colBlocked')} our={ourT.blockedAvg} enemy={enemyT.blockedAvg} format={int} />
              </div>
            </Panel>
            <Panel title={t('topPlayers')}>
              <TopPlayers rows={all} onOpen={setOpen} />
            </Panel>
            <Panel title={t('classMix')}>
              <ClassMix our={a.our} enemy={a.enemy} t={t} />
            </Panel>
            <Panel
              title={t('summary')}
              action={
                <button
                  className="btn sm ghost"
                  onClick={async () => {
                    await navigator.clipboard.writeText(summary.join('\n'))
                    toast(t('copied'))
                  }}
                >
                  {t('copy')}
                </button>
              }
            >
              <ul className="summary">
                {summary.map((l) => (
                  <li key={l}>{l}</li>
                ))}
              </ul>
            </Panel>
          </div>
        </div>
      )}

      {tab === 'our' && <TeamTable rows={a.our} t={t} onOpen={setOpen} />}
      {tab === 'enemy' && <TeamTable rows={a.enemy} t={t} onOpen={setOpen} />}
      {tab === 'battles' && <BattlesTab battles={a.battles} errors={local?.errors ?? []} t={t} editable={!!local} />}
      {tab === 'roster' && local && <RosterTab roster={local.roster} t={t} />}

      {open && <PlayerModal row={open} battles={modalBattles} t={t} onClose={() => setOpen(null)} />}
      {shareUrl && <ShareDialog url={shareUrl} t={t} onClose={() => setShareUrl(null)} />}
    </div>
  )
}

function ShareDialog({ url, t, onClose }: { url: string; t: T; onClose: () => void }) {
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal share-dialog" role="dialog" aria-modal="true" aria-label={t('share')} onClick={(e) => e.stopPropagation()}>
        <header className="modal-head">
          <div>
            <h2>{t('shareTitle')}</h2>
            <p className="muted">{t('shareText')}</p>
          </div>
          <button className="icon-btn" onClick={onClose} aria-label={t('close')}>
            ✕
          </button>
        </header>
        <div className="modal-body">
          <textarea className="input share-url" readOnly rows={3} value={url} onFocus={(e) => e.currentTarget.select()} />
          {url.length > 6000 && <p className="muted small">{t('shareTooLong', { n: url.length })}</p>}
          <div className="row-actions">
            <button
              className="btn primary"
              onClick={async () => {
                await navigator.clipboard.writeText(url)
                toast(t('shareCopied'))
              }}
            >
              {t('copy')}
            </button>
            <a className="btn" href={url} target="_blank" rel="noreferrer">
              {t('shareOpen')}
            </a>
          </div>
        </div>
      </div>
    </div>
  )
}

function Stat({ label, value, sub, tone, onClick }: { label: string; value: ReactNode; sub?: string; tone?: 'bad'; onClick?: () => void }) {
  const Tag = onClick ? 'button' : 'div'
  return (
    <Tag className={`stat${tone ? ` ${tone}` : ''}${onClick ? ' clickable' : ''}`} onClick={onClick}>
      <span className="stat-label">{label}</span>
      <span className="stat-value">{value}</span>
      {sub && <span className="stat-sub">{sub}</span>}
    </Tag>
  )
}

function TeamColumn({ rows, side, title, avg, t, onOpen }: { rows: PlayerRow[]; side: 'our' | 'enemy'; title: string; avg: number; t: T; onOpen: (r: PlayerRow) => void }) {
  return (
    <section className={`team-col ${side}`}>
      <header>
        <h3>{title}</h3>
        <span className="muted">
          {t('avgBpr')} <b>{fixed(avg)}</b>
        </span>
      </header>
      <ol>
        {rows.map((r, i) => (
          <li key={r.key}>
            <button onClick={() => onOpen(r)}>
              <span className={`rank r${i + 1}`}>{i + 1}</span>
              <span className="who">
                <span className="nick">
                  {r.nick} <Clan tag={r.clan} />
                </span>
                <span className="muted small">
                  {r.mainTank}
                  {r.battles > 1 && ` · ${r.battles}×`}
                </span>
              </span>
              <span className="adr muted small">{int(r.adr)}</span>
              <Bpr value={r.bpr} size="sm" />
            </button>
          </li>
        ))}
      </ol>
    </section>
  )
}

