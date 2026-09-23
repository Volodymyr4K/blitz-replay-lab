import type { Outcome, PlayerRow } from '../analysis/analyze'
import { bprTier } from '../analysis/bpr'
import type { T } from '../i18n'
import { fixed } from '../lib/format'

/** Mirrored bars: our value grows left, enemy value grows right, scaled to the larger of the two. */
export function CompareRow({ label, our, enemy, format, higherIsBetter = true }: { label: string; our: number; enemy: number; format: (v: number) => string; higherIsBetter?: boolean }) {
  const max = Math.max(our, enemy, 1e-9)
  const ourWins = higherIsBetter ? our > enemy : our < enemy
  const enemyWins = higherIsBetter ? enemy > our : enemy < our
  return (
    <div className="compare-row">
      <b className={ourWins ? 'win our-text' : ''}>{format(our)}</b>
      <div className="compare-bars">
        <span className="bar our" style={{ width: `${(our / max) * 100}%` }} />
        <span className="compare-label">{label}</span>
        <span className="bar enemy" style={{ width: `${(enemy / max) * 100}%` }} />
      </div>
      <b className={enemyWins ? 'win enemy-text' : ''}>{format(enemy)}</b>
    </div>
  )
}

/** Class split per team, from each team's merged totals. */
export function ClassMix({ our, enemy, t }: { our: PlayerRow; enemy: PlayerRow; t: T }) {
  const teams = [
    { label: t('ourTeam'), mix: our.classes, side: 'our' },
    { label: t('enemyTeam'), mix: enemy.classes, side: 'enemy' },
  ]
  return (
    <div className="class-mix">
      {teams.map(({ label, mix, side }) => {
        const total = mix.HT + mix.MT + mix.LT + mix.TD
        return (
          <div key={side} className="mix-row">
            <span className={`mix-label ${side}-text`}>{label}</span>
            <div className="mix-bar">
              {total ? (
                (['HT', 'MT', 'LT', 'TD'] as const).map((c) =>
                  mix[c] ? (
                    <span key={c} className={`seg cls-bg-${c}`} style={{ flexGrow: mix[c] }} title={`${c}: ${mix[c]}`}>
                      {mix[c] / total >= 0.1 ? `${c} ${Math.round((mix[c] / total) * 100)}%` : ''}
                    </span>
                  ) : null,
                )
              ) : (
                <span className="seg empty">—</span>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}

export function TopPlayers({ rows, onOpen }: { rows: PlayerRow[]; onOpen: (r: PlayerRow) => void }) {
  const top = rows.slice(0, 8)
  const max = Math.max(1.4, ...top.map((r) => r.bpr))
  return (
    <div className="top-players">
      {top.map((r) => (
        <button key={r.key} className="top-row" onClick={() => onOpen(r)}>
          <span className="top-name">
            <i className={`dot ${r.side}`} />
            {r.nick}
          </span>
          <span className="top-track">
            <span className={`top-fill ${r.side}`} style={{ width: `${(Math.max(0, r.bpr) / max) * 100}%` }} />
          </span>
          <b className={`bpr-text bpr-${bprTier(r.bpr)}`}>{fixed(r.bpr)}</b>
        </button>
      ))}
    </div>
  )
}

/** Per-battle BPR columns; colour shows the battle outcome, the dashed line marks 1.0. */
export function BprTrend({ points }: { points: { v: number; outcome: Outcome }[] }) {
  const max = Math.max(1.5, ...points.map((p) => p.v))
  const min = Math.min(0, ...points.map((p) => p.v))
  const w = 600
  const h = 90
  const y = (v: number) => h - ((v - min) / (max - min)) * h
  const slot = w / Math.max(points.length, 12)
  const bw = Math.min(slot * 0.7, 28)
  return (
    <svg className="trend" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" role="img" aria-label="BPR trend">
      <line x1={0} x2={w} y1={y(1)} y2={y(1)} className="trend-ref" />
      <line x1={0} x2={w} y1={y(0)} y2={y(0)} className="trend-base" />
      {points.map((p, i) => (
        <rect key={i} x={i * slot + (slot - bw) / 2} width={bw} y={Math.min(y(p.v), y(0))} height={Math.max(1, Math.abs(y(0) - y(p.v)))} rx={2} className={`trend-bar ${p.outcome}`}>
          <title>{fixed(p.v)}</title>
        </rect>
      ))}
    </svg>
  )
}
