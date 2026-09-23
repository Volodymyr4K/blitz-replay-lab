import type { Lang } from '../i18n'

export const fixed = (v: number, d = 2) => (Number.isFinite(v) ? v.toFixed(d) : '—')
export const int = (v: number) => (Number.isFinite(v) ? Math.round(v).toLocaleString('en-US').replace(/,/g, ' ') : '—')
export const pct = (v: number, d = 0) => `${fixed(v * 100, d)}%`
export const signed = (v: number, d = 2) => `${v >= 0 ? '+' : '−'}${Math.abs(v).toFixed(d)}`

export function date(ts: number, lang: Lang) {
  if (!ts) return '—'
  const d = new Date(ts * 1000)
  return d.toLocaleString(lang === 'uk' ? 'uk-UA' : 'en-GB', {
    day: '2-digit',
    month: 'short',
    ...(d.getFullYear() !== new Date().getFullYear() && { year: 'numeric' }),
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function day(ts: number, lang: Lang) {
  if (!ts) return '—'
  const d = new Date(ts * 1000)
  return d.toLocaleDateString(lang === 'uk' ? 'uk-UA' : 'en-GB', {
    day: 'numeric',
    month: 'short',
    ...(d.getFullYear() !== new Date().getFullYear() && { year: 'numeric' }),
  })
}

export function duration(sec: number | null) {
  if (sec === null) return '—'
  const s = Math.round(sec)
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

export const initials = (nick: string) => nick.replace(/[^\p{L}\p{N}]/gu, '').slice(0, 2).toUpperCase() || '?'
