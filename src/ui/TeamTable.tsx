import { useMemo, useState, type ReactNode } from 'react'
import { byBpr, type PlayerRow } from '../analysis/analyze'
import type { Key, T } from '../i18n'
import { fixed, int, pct } from '../lib/format'
import { Bpr, Clan, Meter } from './bits'

interface Col {
  id: string
  label: Key
  value: (r: PlayerRow) => number | string
  render?: (r: PlayerRow) => ReactNode
  on: boolean
  align?: 'left'
}

const COLS: Col[] = [
  { id: 'bpr', label: 'colBpr', value: (r) => r.bpr, render: (r) => <Bpr value={r.bpr} size="sm" />, on: true },
  { id: 'battles', label: 'colBattles', value: (r) => r.battles, on: true },
  { id: 'wr', label: 'colWr', value: (r) => r.winRate, render: (r) => pct(r.winRate), on: true },
  { id: 'tank', label: 'colTank', value: (r) => r.mainTank, render: (r) => <span className="tank-tag" title={r.mainTank}>{r.mainTank}</span>, on: true, align: 'left' },
  {
    id: 'classes',
    label: 'colClasses',
    value: (r) => r.classes.HT * 1e6 + r.classes.MT * 1e4 + r.classes.LT * 100 + r.classes.TD,
    render: (r) => (
      <span className="classes">
        {(['HT', 'MT', 'LT', 'TD'] as const).map((c) => (
          <span key={c} className={`cls cls-${c}${r.classes[c] ? '' : ' zero'}`}>
            {r.classes[c]}
          </span>
        ))}
      </span>
    ),
    on: true,
  },
  { id: 'adr', label: 'colAdr', value: (r) => r.adr, render: (r) => int(r.adr), on: true },
  { id: 'kpr', label: 'colKpr', value: (r) => r.kpr, render: (r) => fixed(r.kpr), on: true },
  { id: 'frags', label: 'colFrags', value: (r) => r.frags, on: false },
  { id: 'de', label: 'colDe', value: (r) => r.de, render: (r) => fixed(r.de), on: true },
  { id: 'assist', label: 'colAssist', value: (r) => r.assistAvg, render: (r) => int(r.assistAvg), on: true },
  { id: 'blocked', label: 'colBlocked', value: (r) => r.blockedAvg, render: (r) => int(r.blockedAvg), on: true },
  {
    id: 'acch',
    label: 'colAccH',
    value: (r) => r.accH,
    render: (r) => (
      <span className="acc">
        <Meter value={r.accH} max={1} />
        {pct(r.accH)}
      </span>
    ),
    on: true,
  },
  {
    id: 'accp',
    label: 'colAccP',
    value: (r) => r.accP,
    render: (r) => (
      <span className="acc">
        <Meter value={r.accP} max={1} />
        {pct(r.accP)}
      </span>
    ),
    on: true,
  },
  { id: 'fp', label: 'colFirepower', value: (r) => r.firepower, render: (r) => fixed(r.firepower, 1), on: false },
  { id: 'aim', label: 'colAim', value: (r) => r.aim, render: (r) => fixed(r.aim, 1), on: false },
  { id: 'sup', label: 'colSupport', value: (r) => r.support, render: (r) => fixed(r.support, 1), on: false },
  { id: 'supr', label: 'colSupremacy', value: (r) => r.supremacy, render: (r) => fixed(r.supremacy, 1), on: false },
  { id: 'ip', label: 'colIPoints', value: (r) => r.iPointsAvg, render: (r) => fixed(r.iPointsAvg, 1), on: false },
  { id: 'sp', label: 'colSPoints', value: (r) => r.sPointsAvg, render: (r) => fixed(r.sPointsAvg, 1), on: false },
  { id: 'shots', label: 'colShots', value: (r) => r.shots, on: false },
  { id: 'hits', label: 'colHits', value: (r) => r.hits, on: false },
  { id: 'pens', label: 'colPens', value: (r) => r.pens, on: false },
  { id: 'xp', label: 'colXp', value: (r) => r.xpAvg, render: (r) => int(r.xpAvg), on: false },
  { id: 'id', label: 'colId', value: (r) => r.id, on: false },
]

const NICK: Col = { id: 'nick', label: 'colPlayer', value: (r) => r.nick, on: true, align: 'left' }
const findCol = (id: string) => (id === NICK.id ? NICK : COLS.find((c) => c.id === id)) ?? COLS[0]

const COLS_KEY = 'bra:cols'

function loadCols(): Set<string> {
  try {
    const saved = JSON.parse(localStorage.getItem(COLS_KEY) ?? 'null')
    if (Array.isArray(saved)) return new Set(saved)
  } catch {
    /* ignore */
  }
  return new Set(COLS.filter((c) => c.on).map((c) => c.id))
}

export function TeamTable({ rows, t, onOpen }: { rows: PlayerRow[]; t: T; onOpen: (r: PlayerRow) => void }) {
  const [query, setQuery] = useState('')
  const [minBattles, setMinBattles] = useState(1)
  const [sort, setSort] = useState<{ id: string; dir: 1 | -1 }>({ id: 'bpr', dir: -1 })
  const [visible, setVisible] = useState(loadCols)
  const [menu, setMenu] = useState(false)

  const rank = useMemo(() => new Map([...rows].sort(byBpr).map((r, i) => [r.key, i + 1])), [rows])
  const maxBattles = Math.max(1, ...rows.map((r) => r.battles))

  const shown = useMemo(() => {
    const col = findCol(sort.id)
    const q = query.trim().toLowerCase()
    return rows
      .filter((r) => r.battles >= minBattles && (!q || r.nick.toLowerCase().includes(q) || r.clan?.toLowerCase().includes(q)))
      .sort((a, b) => {
        const x = col.value(a)
        const y = col.value(b)
        const c = typeof x === 'string' ? x.localeCompare(String(y), undefined, { sensitivity: 'base' }) : x - (y as number)
        return c * sort.dir || byBpr(a, b)
      })
  }, [rows, query, minBattles, sort])

  const cols = COLS.filter((c) => visible.has(c.id))

  const toggleCol = (id: string) => {
    const next = new Set(visible)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    setVisible(next)
    try {
      localStorage.setItem(COLS_KEY, JSON.stringify([...next]))
    } catch {
      /* ignore */
    }
  }

  const header = (id: string, label: Key, extra = '') => (
    <th key={id} className={`${sort.id === id ? 'sorted' : ''} ${extra}`.trim()} aria-sort={sort.id === id ? (sort.dir === 1 ? 'ascending' : 'descending') : undefined}>
      <button
        type="button"
        className="sort-btn"
        onClick={() => setSort((s) => ({ id, dir: s.id === id ? (-s.dir as 1 | -1) : id === 'nick' || id === 'tank' ? 1 : -1 }))}
      >
        {t(label)}
        {sort.id === id && <span className="arrow">{sort.dir === 1 ? '▲' : '▼'}</span>}
      </button>
    </th>
  )

  return (
    <div className="team-table">
      <div className="table-tools">
        <input className="input search" aria-label={t('search')} placeholder={t('search')} value={query} onChange={(e) => setQuery(e.target.value)} />
        {maxBattles > 1 && (
          <label className="min-battles">
            {t('minBattles')}
            <input type="range" min={1} max={maxBattles} value={minBattles} onChange={(e) => setMinBattles(Number(e.target.value))} />
            <b>{minBattles}</b>
          </label>
        )}
        <span className="muted">{t('playersN', { n: shown.length })}</span>
        <div className="col-menu">
          <button className="btn sm" onClick={() => setMenu((m) => !m)} aria-expanded={menu}>
            {t('columns')} ▾
          </button>
          {menu && (
            <>
              <div className="backdrop-clear" onClick={() => setMenu(false)} />
              <div className="col-list">
                {COLS.map((c) => (
                  <label key={c.id}>
                    <input type="checkbox" checked={visible.has(c.id)} onChange={() => toggleCol(c.id)} />
                    {t(c.label)}
                  </label>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
      <div className="table-scroll">
        <table className="grid">
          <thead>
            <tr>
              <th className="rank-col sticky-a">{t('colRank')}</th>
              {header('nick', 'colPlayer', 'left sticky-b')}
              {cols.map((c) => header(c.id, c.label, c.align))}
            </tr>
          </thead>
          <tbody>
            {shown.map((r) => (
              <tr key={r.key} onClick={() => onOpen(r)} tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && onOpen(r)}>
                <td className="rank-col sticky-a">
                  <span className={`rank r${rank.get(r.key)}`}>{rank.get(r.key)}</span>
                </td>
                <td className="left player-cell sticky-b" title={r.clan ? `${r.nick} [${r.clan}]` : r.nick}>
                  <span className="nick">{r.nick}</span> <Clan tag={r.clan} />
                </td>
                {cols.map((c) => (
                  <td key={c.id} className={c.align === 'left' ? 'left' : ''} data-label={t(c.label)}>
                    {c.render ? c.render(r) : c.value(r)}
                  </td>
                ))}
              </tr>
            ))}
            {!shown.length && (
              <tr className="empty">
                <td colSpan={cols.length + 2}>{t('noPlayers')}</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
