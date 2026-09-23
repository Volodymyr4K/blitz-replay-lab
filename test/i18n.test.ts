// Translation consistency: every language has every key, the same {placeholders},
// and the plural forms its grammar needs.
import { describe, expect, it } from 'vitest'
import { dictionaries, KEYS, translate, type Lang, type Plural } from '../src/i18n'

const LANGS = Object.keys(dictionaries) as Lang[]
const forms = (v: string | Plural) => (typeof v === 'string' ? [v] : Object.values(v).filter((x): x is string => typeof x === 'string'))
const placeholders = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort()

describe('translations', () => {
  it('have no empty strings', () => {
    for (const lang of LANGS) for (const key of KEYS) for (const s of forms(dictionaries[lang][key])) expect(s.trim(), `${lang}.${key}`).not.toBe('')
  })

  it('use the same placeholders in every language and form', () => {
    for (const key of KEYS) {
      const expected = placeholders(forms(dictionaries.en[key])[0])
      for (const lang of LANGS) for (const s of forms(dictionaries[lang][key])) expect(placeholders(s), `${lang}.${key}`).toEqual(expected)
    }
  })

  it('provide every plural category the language uses', () => {
    for (const lang of LANGS) {
      const needed = new Intl.PluralRules(lang).resolvedOptions().pluralCategories.filter((c) => c !== 'zero' && c !== 'two')
      for (const key of KEYS) {
        const v = dictionaries[lang][key]
        if (typeof v === 'string') continue
        for (const c of needed) expect(v[c as keyof Plural], `${lang}.${key}.${c}`).toBeTruthy()
      }
    }
  })

  it('picks Ukrainian plural forms correctly', () => {
    const n = (count: number) => translate('uk', 'battlesN', { n: count })
    expect([1, 2, 5, 11, 21, 22, 25, 101].map(n)).toEqual(['1 бій', '2 бої', '5 боїв', '11 боїв', '21 бій', '22 бої', '25 боїв', '101 бій'])
    expect(translate('en', 'battlesN', { n: 1 })).toBe('1 battle')
    expect(translate('en', 'battlesN', { n: 3 })).toBe('3 battles')
  })
})
