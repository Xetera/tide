import type { HighlightLabel } from '@tide/htmlegy'
import type { EntityPatch, JobSource } from '~/funnels/types'
import type { EntityValidationError } from '~/funnels/entity-validator'
import type { ScrapeSource } from '~/shared/log'

export interface HighlightEntry {
  element: Element
  label: HighlightLabel
  entity?: string
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
