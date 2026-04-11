import type { RawEntityPatch, JobSource } from '~/site-spec/types'

export interface SourceEmission {
  patches: RawEntityPatch[]
  source: JobSource
  warnings: string[]
}

export interface DataSource {
  start(): void
  stop(): void
}
