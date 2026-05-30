import { expandLocaleSuffix, localeFormatParts } from './number-parser'

export const CURRENCY_MINOR_UNITS: Record<string, number> = {
  AED: 2,
  AUD: 2,
  BGN: 2,
  BHD: 3,
  BRL: 2,
  CAD: 2,
  CHF: 2,
  CLP: 0,
  CNY: 2,
  COP: 2,
  CZK: 2,
  DKK: 2,
  EGP: 2,
  EUR: 2,
  GBP: 2,
  HKD: 2,
  HUF: 2,
  IDR: 2,
  ILS: 2,
  INR: 2,
  ISK: 0,
  JOD: 3,
  JPY: 0,
  KRW: 0,
  KWD: 3,
  MXN: 2,
  MYR: 2,
  NOK: 2,
  NZD: 2,
  OMR: 3,
  PHP: 2,
  PKR: 2,
  PLN: 2,
  QAR: 2,
  RON: 2,
  RUB: 2,
  SAR: 2,
  SEK: 2,
  SGD: 2,
  THB: 2,
  TND: 3,
  TRY: 2,
  TWD: 2,
  UAH: 2,
  USD: 2,
  VND: 0,
  ZAR: 2,
}

export const CURRENCY_SYMBOLS: Record<string, string> = {
  '€': 'EUR',
  '£': 'GBP',
  '¥': 'JPY',
  '₺': 'TRY',
  '₹': 'INR',
  '₩': 'KRW',
  '₪': 'ILS',
  '₽': 'RUB',
  '₴': 'UAH',
  '₫': 'VND',
  '฿': 'THB',
  R$: 'BRL',
  CA$: 'CAD',
  A$: 'AUD',
  HK$: 'HKD',
  NZ$: 'NZD',
  S$: 'SGD',
  NT$: 'TWD',
  Mex$: 'MXN',
  US$: 'USD',
  $: 'USD',
  TL: 'TRY',
  Rs: 'INR',
  zł: 'PLN',
  kr: 'SEK',
}

export interface MoneyValue {
  _type: 'money'
  amount: number
  currency: string
}

const SYMBOL_KEYS_BY_LENGTH = Object.keys(CURRENCY_SYMBOLS).sort(
  (a, b) => b.length - a.length,
)

const CODE_RE = /\b([A-Z]{3})\b/

export function inferCurrency(text: string): string | null {
  const code = text.match(CODE_RE)
  if (code && CURRENCY_MINOR_UNITS[code[1]!] !== undefined) {
    return code[1]!
  }
  for (const sym of SYMBOL_KEYS_BY_LENGTH) {
    if (text.includes(sym)) {
      return CURRENCY_SYMBOLS[sym]!
    }
  }
  return null
}

export function parseMoney(
  text: string,
  locale: string,
  explicitCurrency: string | null,
): MoneyValue | null {
  if (text == null) {
    return null
  }
  const raw = String(text).trim()
  if (raw === '') {
    return null
  }
  const currency = (explicitCurrency ?? inferCurrency(raw))?.toUpperCase()
  if (!currency) {
    throw new Error(
      `money: could not determine currency from "${raw}" and no currency arg given`,
    )
  }
  if (CURRENCY_MINOR_UNITS[currency] === undefined) {
    throw new Error(`money: unknown currency code "${currency}"`)
  }
  const { group, decimal } = localeFormatParts(locale)
  const expanded = expandLocaleSuffix(raw, locale)
  const digitsOnly = expanded.replace(/[^0-9.,-]/g, '')
  if (digitsOnly === '' || digitsOnly === '-') {
    return null
  }
  const normalized = digitsOnly.replaceAll(group, '').replace(decimal, '.')
  const amount = parseFloat(normalized)
  if (Number.isNaN(amount)) {
    return null
  }
  return { _type: 'money', amount, currency }
}
