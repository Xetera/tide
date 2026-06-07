import type { EntityPatch, ScrapeSource } from '@tide/spec'
export { scrapeSourceFunnelKey } from '@tide/spec'
export type { ScrapeSource } from '@tide/spec'

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

export type ScrapeLog = {
  id: string
  type: 'scrape'
  severity: 'info'
  /** unix timestamp */
  date: number
  patches: EntityPatch[]
  warnings: readonly string[]
  status: ScrapeLogStatus
  source?: ScrapeSource
  httpStatus?: number
  serverResponse?: string
}

export type Log = PlainLog | ScrapeLog
