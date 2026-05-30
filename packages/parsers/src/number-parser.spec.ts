import { describe, it, expect } from 'vitest'
import {
  expandLocaleSuffix,
  localeFormatParts,
  parseLocaleNumber,
} from './number-parser'

describe('localeFormatParts', () => {
  it('returns comma group and dot decimal for en', () => {
    expect(localeFormatParts('en-US')).toEqual({ group: ',', decimal: '.' })
  })

  it('returns dot group and comma decimal for de', () => {
    expect(localeFormatParts('de-DE')).toEqual({ group: '.', decimal: ',' })
  })

  it('returns dot group and comma decimal for tr', () => {
    expect(localeFormatParts('tr')).toEqual({ group: '.', decimal: ',' })
  })
})

describe('parseLocaleNumber', () => {
  it('parses an en-US thousands and decimal grouping', () => {
    expect(parseLocaleNumber('1,234.56', 'en-US')).toBe(1234.56)
  })

  it('parses a tr thousands and decimal grouping', () => {
    expect(parseLocaleNumber('1.234,56', 'tr')).toBe(1234.56)
  })

  it('parses an integer without grouping', () => {
    expect(parseLocaleNumber('4980', 'en')).toBe(4980)
  })

  it('returns NaN for unparseable input', () => {
    expect(Number.isNaN(parseLocaleNumber('abc', 'en'))).toBe(true)
  })
})

describe('expandLocaleSuffix', () => {
  it('expands en k suffix', () => {
    expect(expandLocaleSuffix('1.5k', 'en')).toBe('1500')
  })

  it('expands en m suffix with whitespace', () => {
    expect(expandLocaleSuffix('2 m', 'en-US')).toBe('2000000')
  })

  it('expands tr milyon suffix', () => {
    expect(expandLocaleSuffix('1,5 milyon', 'tr')).toBe('1500000')
  })

  it('prefers the longest matching suffix', () => {
    expect(expandLocaleSuffix('3 milyar', 'tr')).toBe('3000000000')
  })

  it('returns the original string when no suffix matches', () => {
    expect(expandLocaleSuffix('1234', 'en')).toBe('1234')
  })

  it('returns the original string for an unknown locale', () => {
    expect(expandLocaleSuffix('1k', 'ja')).toBe('1k')
  })
})
