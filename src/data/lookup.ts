import tanks from './tanks.json'
import maps from './maps.json'
import { translate } from '../i18n'

export type TankClass = 'HT' | 'MT' | 'LT' | 'TD' | ''

export interface TankInfo {
  name: string
  type: TankClass
  tier: number
}

const tankTable = tanks as unknown as Record<string, [string, TankClass, number]>

/**
 * Hand-verified class/tier for frequently played tanks the upstream data leaves without a class.
 * Applied only where tanks.json has no class, so official data always wins once it appears.
 */
const CLASS_GAPS: Record<number, { type: TankClass; tier: number }> = {
  // Rheinmetall Panzerwagen — German tier X light tank (wiki.wargaming.net/en/Tank:G125_Spz_57_Rh).
  28689: { type: 'LT', tier: 10 },
  // Felice — Italian tier X heavy in Blitz (guidesblitz.com/felice; tier IX medium only on PC).
  20097: { type: 'HT', tier: 10 },
  // Type 5 Heavy — Japanese tier X heavy.
  8033: { type: 'HT', tier: 10 },
}
const mapTable = maps as Record<string, { en: string; uk: string }>

export function tankInfo(id: number): TankInfo {
  const t = tankTable[id]
  if (!t) return { name: `#${id}`, type: '', tier: 0 }
  const gap = t[1] ? undefined : CLASS_GAPS[id]
  return { name: t[0], type: gap?.type ?? t[1], tier: t[2] || gap?.tier || 0 }
}

export const knownMap = (id: number) => id in mapTable

export function mapName(id: number, code: string | null, lang: 'en' | 'uk'): string {
  const m = mapTable[id]
  if (m) return m[lang] || m.en
  if (code) return code.replace(/[_-]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
  return translate(lang, 'unknownMap', { id })
}

export const TANK_COUNT = Object.keys(tankTable).length
