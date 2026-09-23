import { describe, expect, it } from 'vitest'
import { bprTier } from '../src/analysis/bpr'
import { duration, fixed, int, pct } from '../src/lib/format'
import { errorText } from '../src/lib/labels'
import { translate } from '../src/i18n'

describe('bpr tiers', () => {
  it('uses inclusive lower bounds', () => {
    expect([1.1, 1.0999, 0.9, 0.8999, 0.7, 0.6999, -0.2].map(bprTier)).toEqual(['elite', 'high', 'high', 'mid', 'mid', 'low', 'low'])
  })
})

describe('formatting', () => {
  it('formats numbers for tables', () => {
    expect(int(12345.6)).toBe('12 346')
    expect(fixed(1.005, 2)).toBe('1.00')
    expect(pct(0.8349)).toBe('83%')
    expect(duration(236.7)).toBe('3:57')
    expect(duration(null)).toBe('—')
    expect([int(NaN), fixed(Infinity)]).toEqual(['—', '—'])
  })

  it('translates parse error codes and passes other text through', () => {
    const t = (k: Parameters<typeof translate>[1]) => translate('en', k)
    expect(errorText('no_results', t)).toMatch(/saved before the battle ended/)
    expect(errorText('some raw message', t)).toBe('some raw message')
    expect(errorText('', t)).toBe('unknown error')
  })
})
