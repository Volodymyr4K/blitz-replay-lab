import tanks from './tanks.json'
import maps from './maps.json'

export type TankClass = 'HT' | 'MT' | 'LT' | 'TD' | ''

export interface TankInfo {
  name: string
  type: TankClass
  tier: number
}

const tankTable = tanks as unknown as Record<string, [string, TankClass, number]>
const mapTable = maps as Record<string, { en: string; uk: string }>

export function tankInfo(id: number): TankInfo {
  const t = tankTable[id]
  if (!t) return { name: `Tank #${id}`, type: '', tier: 0 }
  return { name: t[0], type: t[1], tier: t[2] }
}

export function mapName(id: number, code: string | null, lang: 'en' | 'uk'): string {
  const m = mapTable[id]
  if (m) return m[lang] || m.en
  if (code) return code.replace(/[_-]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
  return `Map #${id}`
}

export const TANK_COUNT = Object.keys(tankTable).length
