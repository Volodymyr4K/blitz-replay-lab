import type { PlayerBattle, PlayerRow } from '../analysis/analyze'
import { tankInfo } from '../data/lookup'
import { useLang, type T } from '../i18n'
import { date, fixed, int, pct } from '../lib/format'
import { mapName } from '../data/lookup'
import { Bpr, Clan, Meter, OutcomeTag } from './bits'
import { BprTrend } from './charts'
import { Modal } from './Modal'

export function PlayerModal({
  row,
  battles,
  tankDetail,
  t,
  onClose,
}: {
  row: PlayerRow
  battles: PlayerBattle[] | null
  /** False when a shared link dropped per-tank results to stay short. */
  tankDetail: boolean
  t: T
  onClose: () => void
}) {
  const lang = useLang()

  const tanks = Object.entries(row.tanks)
    .map(([id, s]) => ({ id: Number(id), ...s, info: tankInfo(Number(id)) }))
    .sort((a, b) => b.battles - a.battles || b.damage - a.damage)

  const components = [
    { label: t('colFirepower'), value: row.firepower, max: 150 },
    { label: t('colAim'), value: row.aim, max: 120 },
    { label: t('colSupport'), value: row.support, max: 150 },
    { label: t('colSupremacy'), value: row.supremacy, max: 150 },
  ]

  return (
    <Modal label={row.nick} onClose={onClose}>
      <header className="modal-head">
        <div>
          <div className={`side-chip ${row.side}`}>{row.side === 'our' ? t('ourTeam') : t('enemyTeam')}</div>
          <h2>
            {row.nick} <Clan tag={row.clan} />
          </h2>
          <p className="muted">
            {row.mainTank} · {t('battlesN', { n: row.battles })}
          </p>
        </div>
        <Bpr value={row.bpr} size="lg" />
        <button className="icon-btn" onClick={onClose} aria-label={t('close')}>
          ✕
        </button>
      </header>

      <div className="modal-body">
        <div className="kpis four">
          <Kpi label={t('colAdr')} value={int(row.adr)} />
          <Kpi label={t('colKpr')} value={fixed(row.kpr)} />
          <Kpi label={t('colWr')} value={pct(row.winRate)} />
          <Kpi label={t('colAssist')} value={int(row.assistAvg)} />
          <Kpi label={t('colBlocked')} value={int(row.blockedAvg)} />
          <Kpi label={t('colAccH')} value={pct(row.accH)} />
          <Kpi label={t('colAccP')} value={pct(row.accP)} />
          <Kpi label={t('colDe')} value={fixed(row.de)} />
        </div>

        <h3>{t('modalComponents')}</h3>
        <div className="components">
          {components.map((c) => (
            <div key={c.label} className="component">
              <span>{c.label}</span>
              <Meter value={c.value} max={c.max} tone={row.side} />
              <b>{fixed(c.value, 1)}</b>
            </div>
          ))}
        </div>

        <h3>{t('modalTanks')}</h3>
        <table className="grid compact">
          <thead>
            <tr>
              <th className="left">{t('tank')}</th>
              <th>{t('colBattles')}</th>
              {tankDetail && (
                <>
                  <th>{t('colWr')}</th>
                  <th>{t('colAdr')}</th>
                  <th>{t('colFrags')}</th>
                </>
              )}
            </tr>
          </thead>
          <tbody>
            {tanks.map((tk) => (
              <tr key={tk.id}>
                <td className="left">
                  {tk.info.type && <span className={`cls cls-${tk.info.type}`}>{t(`cls${tk.info.type}`)}</span>} {tk.info.name}
                  {tk.info.tier > 0 && <span className="muted"> · {roman(tk.info.tier)}</span>}
                </td>
                <td>{tk.battles}</td>
                {tankDetail && (
                  <>
                    <td>{pct(tk.wins / tk.battles)}</td>
                    <td>{int(tk.damage / tk.battles)}</td>
                    <td>{tk.frags}</td>
                  </>
                )}
              </tr>
            ))}
          </tbody>
        </table>

        <h3>{t('modalBattles')}</h3>
        {battles ? (
          <>
            {battles.length > 1 && <BprTrend label={t('bprTrendLabel')} points={battles.map((b) => ({ v: b.row.bpr, outcome: b.outcome }))} />}
            <table className="grid compact">
              <thead>
                <tr>
                  <th className="left">{t('battleDate')}</th>
                  <th className="left">{t('battleMap')}</th>
                  <th className="left">{t('tank')}</th>
                  <th>{t('battleResult')}</th>
                  <th>{t('colAdr')}</th>
                  <th>{t('colFrags')}</th>
                  <th>{t('colBpr')}</th>
                </tr>
              </thead>
              <tbody>
                {battles.map((b) => (
                  <tr key={b.battleId}>
                    <td className="left muted">{date(b.timestamp, lang)}</td>
                    <td className="left">{mapName(b.mapId, b.mapCode, lang)}</td>
                    <td className="left">{tankInfo(b.tankId).name}</td>
                    <td>
                      <OutcomeTag outcome={b.outcome} t={t} />
                    </td>
                    <td>{int(b.row.damage)}</td>
                    <td>{b.row.frags}</td>
                    <td>
                      <Bpr value={b.row.bpr} size="sm" />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        ) : (
          <p className="muted">{t('modalNoBattles')}</p>
        )}
      </div>
    </Modal>
  )
}

function Kpi({ label, value }: { label: string; value: string }) {
  return (
    <div className="kpi">
      <span>{label}</span>
      <b>{value}</b>
    </div>
  )
}

const roman = (n: number) => ['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'][n] ?? String(n)
