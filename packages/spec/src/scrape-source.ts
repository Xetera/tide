export type ScrapeSource =
  | { kind: 'network'; site: string; funnel: string; file: string; format: 'jsonata'; label?: string }
  | { kind: 'page'; site: string; url: string; funnel: string; file: string; format: 'htmlegy'; label?: string }

export function scrapeSourceFunnelKey(src: ScrapeSource): string | null {
  return `${src.funnel}/${src.file}`
}
