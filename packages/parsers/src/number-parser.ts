export const LOCALE_SUFFIXES: Record<string, Record<string, number>> = {
  en: {
    k: 1_000,
    m: 1_000_000,
    b: 1_000_000_000,
  },
  tr: {
    bin: 1_000,
    b: 1_000,
    k: 1_000,
    milyon: 1_000_000,
    mn: 1_000_000,
    m: 1_000_000,
    milyar: 1_000_000_000,
    mr: 1_000_000_000,
  },
}

export function localeFormatParts(locale: string): {
  group: string
  decimal: string
} {
  const parts = new Intl.NumberFormat(locale).formatToParts(1111.1)
  return {
    group: parts.find((p) => p.type === 'group')?.value ?? ',',
    decimal: parts.find((p) => p.type === 'decimal')?.value ?? '.',
  }
}

export function expandLocaleSuffix(str: string, locale: string): string {
  const suffixes = LOCALE_SUFFIXES[locale.split('-')[0]!]
  if (!suffixes) {
    return str
  }
  const pattern = Object.keys(suffixes)
    .sort((a, b) => b.length - a.length)
    .join('|')
  const m = str.trim().match(new RegExp(`^([\\d.,]+)\\s*(${pattern})\\b`, 'i'))
  if (!m || !m[1] || !m[2]) {
    return str
  }
  const multiplier = suffixes[m[2].toLowerCase()] ?? 1
  const { group, decimal } = localeFormatParts(locale)
  const n = parseFloat(m[1].replaceAll(group, '').replace(decimal, '.'))
  return String(n * multiplier)
}

export function parseLocaleNumber(str: string, locale: string): number {
  const { group, decimal } = localeFormatParts(locale)
  const expanded = expandLocaleSuffix(str, locale)
  const normalized = expanded.replaceAll(group, '').replace(decimal, '.')
  return parseFloat(normalized)
}
