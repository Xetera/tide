import { parse } from 'date-fns'
import type { Locale } from 'date-fns'
import * as locales from 'date-fns/locale'

const LOCALE_ALIASES: Record<string, keyof typeof locales> = {
  en: 'enUS',
  'en-us': 'enUS',
  'en-gb': 'enGB',
  'pt-br': 'ptBR',
  'zh-cn': 'zhCN',
  'zh-tw': 'zhTW',
}

function resolveLocale(locale: string): Locale | undefined {
  const key = locale.toLowerCase()
  const aliased = LOCALE_ALIASES[key]
  if (aliased) {
    return (locales as Record<string, Locale>)[aliased]
  }
  const direct = (locales as Record<string, Locale>)[locale]
  if (direct) {
    return direct
  }
  const lang = key.split('-')[0]!
  return (locales as Record<string, Locale>)[lang]
}

export function parseLocaleDate(
  str: string,
  locale: string,
  format?: string,
): string | null {
  const trimmed = str.trim()
  if (format) {
    const parsed = parse(trimmed, format, new Date(), {
      locale: resolveLocale(locale),
    })
    return isNaN(parsed.getTime()) ? null : parsed.toISOString()
  }
  const native = new Date(trimmed)
  return isNaN(native.getTime()) ? null : native.toISOString()
}
