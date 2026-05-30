import { describe, it, expect } from 'vitest'
import { inferCurrency, parseMoney } from './money'

describe('inferCurrency', () => {
  it('returns an ISO code when present in the text', () => {
    expect(inferCurrency('1234,56 TRY')).toBe('TRY')
  })

  it('returns the currency for a leading symbol', () => {
    expect(inferCurrency('$1,234.56')).toBe('USD')
  })

  it('prefers the longest matching symbol', () => {
    expect(inferCurrency('CA$ 19.99')).toBe('CAD')
  })

  it('returns null when no currency can be found', () => {
    expect(inferCurrency('49.99')).toBeNull()
  })
})

describe('parseMoney', () => {
  it('parses an en-US amount with an inferred symbol', () => {
    expect(parseMoney('$1,234.56', 'en-US', null)).toEqual({
      _type: 'money',
      amount: 1234.56,
      currency: 'USD',
    })
  })

  it('parses a tr amount with an explicit currency', () => {
    expect(parseMoney('1.234,56 TL', 'tr', 'TRY')).toEqual({
      _type: 'money',
      amount: 1234.56,
      currency: 'TRY',
    })
  })

  it('expands a tr magnitude suffix before parsing', () => {
    expect(parseMoney('1,5 M', 'tr', 'TRY')).toEqual({
      _type: 'money',
      amount: 1_500_000,
      currency: 'TRY',
    })
  })

  it('expands a tr milyon suffix before parsing', () => {
    expect(parseMoney('1,5 milyon', 'tr', 'TRY')).toEqual({
      _type: 'money',
      amount: 1_500_000,
      currency: 'TRY',
    })
  })

  it('parses a JPY amount with zero decimals', () => {
    expect(parseMoney('¥4980', 'en', null)).toEqual({
      _type: 'money',
      amount: 4980,
      currency: 'JPY',
    })
  })

  it('returns null for an empty string', () => {
    expect(parseMoney('', 'en', 'USD')).toBeNull()
  })

  it('returns null when the digit-stripped input is empty', () => {
    expect(parseMoney('$', 'en', 'USD')).toBeNull()
  })

  it('throws when no currency can be inferred and none is given', () => {
    expect(() => parseMoney('49.99', 'en', null)).toThrow(/currency/)
  })

  it('throws on an unknown currency code', () => {
    expect(() => parseMoney('100', 'en', 'XYZ')).toThrow(/unknown currency/)
  })

  it('uppercases the explicit currency arg', () => {
    expect(parseMoney('100', 'en', 'usd')).toEqual({
      _type: 'money',
      amount: 100,
      currency: 'USD',
    })
  })
})
