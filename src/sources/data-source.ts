import type { EntityPatch, JobSource } from '~/site-spec/types'

export interface SourceEmission {
  patches: EntityPatch[]
  source: JobSource
  warnings: string[]
}

export interface DataSource {
  start(): void
  stop(): void
}
