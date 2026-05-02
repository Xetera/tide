import type { RawEntityPatch, JobSource } from '~/site-spec/types'
import type { ScrapeSource } from '~/shared'

export interface SourceEmission {
  patches: RawEntityPatch[]
  source: JobSource
  warnings: string[]
  scrapeSource?: ScrapeSource
}

export interface DataSource {
  start(): void
  stop(): void
}
