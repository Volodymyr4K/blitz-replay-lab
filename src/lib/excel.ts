import type { Analysis, PlayerRow } from '../analysis/analyze'
import type { Key, T } from '../i18n'

/** Headers reuse the on-screen column labels, so the sheet matches the UI language. */
const COLUMNS: { header: Key; width: number; value: (r: PlayerRow) => string | number }[] = [
  { header: 'colId', width: 13, value: (r) => r.id },
  { header: 'colPlayer', width: 22, value: (r) => r.nick },
  { header: 'colClan', width: 9, value: (r) => r.clan ?? '' },
  { header: 'colBattles', width: 8, value: (r) => r.battles },
  { header: 'colWins', width: 8, value: (r) => r.wins },
  { header: 'colWr', width: 8, value: (r) => round(r.winRate * 100, 1) },
  { header: 'clsHT', width: 5, value: (r) => r.classes.HT },
  { header: 'clsMT', width: 5, value: (r) => r.classes.MT },
  { header: 'clsLT', width: 5, value: (r) => r.classes.LT },
  { header: 'clsTD', width: 5, value: (r) => r.classes.TD },
  { header: 'colTank', width: 20, value: (r) => r.mainTank },
  { header: 'colAdr', width: 8, value: (r) => round(r.adr) },
  { header: 'colFrags', width: 7, value: (r) => r.frags },
  { header: 'colKpr', width: 9, value: (r) => round(r.kpr) },
  { header: 'colDe', width: 9, value: (r) => round(r.de) },
  { header: 'colAssist', width: 8, value: (r) => round(r.assistAvg) },
  { header: 'colBlocked', width: 8, value: (r) => round(r.blockedAvg) },
  { header: 'colShots', width: 8, value: (r) => r.shots },
  { header: 'colHits', width: 8, value: (r) => r.hits },
  { header: 'colPens', width: 8, value: (r) => r.pens },
  { header: 'colAccH', width: 8, value: (r) => round(r.accH * 100) },
  { header: 'colAccP', width: 8, value: (r) => round(r.accP * 100) },
  { header: 'colIPoints', width: 10, value: (r) => round(r.iPointsAvg) },
  { header: 'colSPoints', width: 10, value: (r) => round(r.sPointsAvg) },
  { header: 'colFirepower', width: 10, value: (r) => round(r.firepower) },
  { header: 'colAim', width: 9, value: (r) => round(r.aim) },
  { header: 'colSupport', width: 10, value: (r) => round(r.support) },
  { header: 'colSupremacy', width: 10, value: (r) => round(r.supremacy) },
  { header: 'colBpr', width: 9, value: (r) => round(r.bpr) },
]

const round = (v: number, d = 2) => Math.round(v * 10 ** d) / 10 ** d

function sheet(rows: PlayerRow[], name: string, headerColor: string, t: T) {
  const header = COLUMNS.map((c) => ({
    value: t(c.header),
    fontWeight: 'bold' as const,
    textColor: '#FFFFFF',
    backgroundColor: headerColor,
    align: 'center' as const,
  }))
  const body = rows.map((r) => COLUMNS.map((c) => ({ value: c.value(r) })))
  return {
    sheet: name,
    data: [header, ...body],
    columns: COLUMNS.map((c) => ({ width: c.width })),
    stickyRowsCount: 1,
  }
}

export async function exportExcel(a: Analysis, fileName: string, t: T) {
  const { default: writeExcelFile } = await import('write-excel-file/browser')
  const blob = await writeExcelFile([sheet(a.our, t('ourTeam'), '#E8A33D', t), sheet(a.enemy, t('enemyTeam'), '#4B5563', t)]).toBlob()
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `${fileName.replace(/[\\/:*?"<>|]+/g, '_') || 'blitz-report'}.xlsx`
  link.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

const NAME_HEADERS = ['nickname', 'nick', 'player', 'name', 'нік', 'гравець', 'ник', 'игрок']

/** Read nicknames from .xlsx (a nickname-like column, else the first column), .csv or .txt. */
export async function readRoster(file: File): Promise<string[]> {
  let rows: unknown[][]
  if (file.name.toLowerCase().endsWith('.xlsx')) {
    const { readSheet } = await import('read-excel-file/browser')
    rows = (await readSheet(file)) as unknown[][]
  } else {
    rows = (await file.text()).split(/\r?\n/).map((l) => l.split(/[,;\t]/))
  }
  if (!rows.length) return []
  const head = rows[0].map((c) => String(c ?? '').trim().toLowerCase())
  const col = head.findIndex((h) => NAME_HEADERS.includes(h))
  const body = col >= 0 ? rows.slice(1) : rows
  return body.map((r) => String(r[Math.max(col, 0)] ?? '').trim()).filter(Boolean)
}
