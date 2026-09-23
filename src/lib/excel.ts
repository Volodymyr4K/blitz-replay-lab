import type { Analysis, PlayerRow } from '../analysis/analyze'

const COLUMNS: { header: string; width: number; value: (r: PlayerRow) => string | number }[] = [
  { header: 'Account ID', width: 13, value: (r) => r.id },
  { header: 'Nickname', width: 22, value: (r) => r.nick },
  { header: 'Clan', width: 9, value: (r) => r.clan ?? '' },
  { header: 'Battles', width: 8, value: (r) => r.battles },
  { header: 'Wins', width: 7, value: (r) => r.wins },
  { header: 'Win rate %', width: 10, value: (r) => round(r.winRate * 100, 1) },
  { header: 'HT', width: 5, value: (r) => r.classes.HT },
  { header: 'MT', width: 5, value: (r) => r.classes.MT },
  { header: 'LT', width: 5, value: (r) => r.classes.LT },
  { header: 'TD', width: 5, value: (r) => r.classes.TD },
  { header: 'Main tank', width: 20, value: (r) => r.mainTank },
  { header: 'ADR', width: 8, value: (r) => round(r.adr) },
  { header: 'Frags', width: 7, value: (r) => r.frags },
  { header: 'KPR', width: 7, value: (r) => round(r.kpr) },
  { header: 'DE', width: 7, value: (r) => round(r.de) },
  { header: 'Assist', width: 8, value: (r) => round(r.assistAvg) },
  { header: 'Blocked', width: 8, value: (r) => round(r.blockedAvg) },
  { header: 'Shots', width: 7, value: (r) => r.shots },
  { header: 'Hits', width: 7, value: (r) => r.hits },
  { header: 'Pens', width: 7, value: (r) => r.pens },
  { header: 'AccH %', width: 8, value: (r) => round(r.accH * 100) },
  { header: 'AccP %', width: 8, value: (r) => round(r.accP * 100) },
  { header: 'iPoints', width: 8, value: (r) => round(r.iPointsAvg) },
  { header: 'sPoints', width: 8, value: (r) => round(r.sPointsAvg) },
  { header: 'Firepower', width: 10, value: (r) => round(r.firepower) },
  { header: 'AIM', width: 8, value: (r) => round(r.aim) },
  { header: 'Support', width: 9, value: (r) => round(r.support) },
  { header: 'Supremacy', width: 10, value: (r) => round(r.supremacy) },
  { header: 'BPR 2.0', width: 9, value: (r) => round(r.bpr) },
]

const round = (v: number, d = 2) => Math.round(v * 10 ** d) / 10 ** d

function sheet(rows: PlayerRow[], name: string, headerColor: string) {
  const header = COLUMNS.map((c) => ({
    value: c.header,
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

export async function exportExcel(a: Analysis, fileName: string) {
  const { default: writeExcelFile } = await import('write-excel-file/browser')
  const blob = await writeExcelFile([sheet(a.our, 'Our team', '#E8A33D'), sheet(a.enemy, 'Enemy team', '#4B5563')]).toBlob()
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
