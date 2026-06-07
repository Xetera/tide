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

function normalizeLocaleNumber(str: string, locale: string): number {
  const { group, decimal } = localeFormatParts(locale)
  return parseFloat(str.replaceAll(group, '').replace(decimal, '.'))
}

function matchLocaleSuffix(
  str: string,
  locale: string,
): { value: number; multiplier: number } | null {
  const base = locale.split('-')[0]!
  const suffixes = LOCALE_SUFFIXES[base]
  if (!suffixes) {
    return null
  }
  const lowered = str.trim().toLocaleLowerCase(locale)
  const pattern = Object.keys(suffixes)
    .sort((a, b) => b.length - a.length)
    .join('|')
  const m = lowered.match(new RegExp(`^([\\d.,]+)\\s*(${pattern})\\b`))
  if (!m || !m[1] || !m[2]) {
    return null
  }
  return {
    value: normalizeLocaleNumber(m[1], locale),
    multiplier: suffixes[m[2]] ?? 1,
  }
}

function applyMultiplier(value: number, multiplier: number): number {
  return Math.round((value * multiplier + Number.EPSILON) * 100) / 100
}

export function expandLocaleSuffix(str: string, locale: string): string {
  const matched = matchLocaleSuffix(str, locale)
  if (!matched) {
    return str
  }
  return String(applyMultiplier(matched.value, matched.multiplier))
}

export function parseLocaleNumber(str: string, locale: string): number {
  const matched = matchLocaleSuffix(str, locale)
  if (matched) {
    return applyMultiplier(matched.value, matched.multiplier)
  }
  return normalizeLocaleNumber(str, locale)
}
