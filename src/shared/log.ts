export const EVENTS_KEY = 'events'

export type PlainLog = {
  /** randomly generated id */
  id: string
  type: 'plain'
  severity: 'info' | 'warning' | 'error' | 'debug'
  scope?: string
  data?: Record<string, unknown>
  text: string
  /** unix timestamp */
  date: number
  viewedAt?: Date
  name?: 'REQUEST_SENT'
}

export type ScrapeLogStatus = 'pending' | 'submitted' | 'failed'

export type ScrapeSource =
  | { kind: 'network'; site: string; funnel: string; file: string; format: 'jsonata'; label?: string }
  | { kind: 'page'; site: string; url: string; funnel: string; file: string; format: 'htmlegy'; label?: string }

export function scrapeSourceFunnelKey(src: ScrapeSource): string | null {
  return `${src.funnel}/${src.file}`
}

export type ScrapeLog = {
  id: string
  type: 'scrape'
  severity: 'info'
  /** unix timestamp */
  date: number
  patches: import('../funnels/types').EntityPatch[]
  warnings: readonly string[]
  status: ScrapeLogStatus
  source?: ScrapeSource
  httpStatus?: number
  serverResponse?: string
}

export type Log = PlainLog | ScrapeLog
