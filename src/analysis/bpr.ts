/**
 * BPR 2.0 (Blitz Performance Rating), per the formula used by BlitzScrim
 * (roklimovich/wotblitz-replay-analyzer, MIT). Inputs are per-battle averages;
 * accuracies are 0–1 fractions.
 */
export interface BprInput {
  adr: number
  kpr: number
  de: number
  assist: number
  blocked: number
  accH: number
  accP: number
  iPoints: number
  sPoints: number
}

export interface BprResult {
  firepower: number
  aim: number
  support: number
  supremacy: number
  bpr: number
}

export function bpr(i: BprInput): BprResult {
  const firepower = ((100 + i.adr) * (1 + i.kpr) ** (1 / 7) - 777) / 20
  const aim = ((1 + i.accH) * (1 + i.accP) - 0.9) / 0.029
  const support = ((1 + i.de) ** 2 * (200 + i.assist) ** 2 * (400 + i.blocked)) ** (1 / 3) / 19
  const supremacy = Math.sqrt(Math.max(0, 40 + i.iPoints + i.sPoints)) / 0.13
  const total = (17 * firepower + 3 * aim + 2 * support + 3 * supremacy) / 25 / 76
  return { firepower, aim, support, supremacy, bpr: total }
}

export type BprTier = 'elite' | 'high' | 'mid' | 'low'

export function bprTier(v: number): BprTier {
  if (v >= 1.1) return 'elite'
  if (v >= 0.9) return 'high'
  if (v >= 0.7) return 'mid'
  return 'low'
}
