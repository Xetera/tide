import type { HighlightLabel } from '~/htmlevate/compiler'
import type { EntityPatch, JobSource } from '~/site-spec/types'
import type { EntityValidationError } from '~/extraction/entity-validator'
import type { ScrapeSource } from '~/shared/log'

export interface HighlightEntry {
  element: Element
  label: HighlightLabel
  isArrayItem?: boolean
}

export interface ScrapeResult {
  patches: EntityPatch[]
  highlights: readonly HighlightEntry[]
  patchCounts: Map<string, number>
  errors: EntityValidationError[]
  warnings: string[]
  scrapeSource?: ScrapeSource
  source?: JobSource
}
