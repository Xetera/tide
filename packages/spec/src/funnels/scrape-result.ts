import type { HighlightLabel } from '@tide/htmlegy'
import type { EntityPatch, JobSource } from './types'
import type { EntityValidationError } from './entity-validator'
import type { ScrapeSource } from '../scrape-source'

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

/**
 * The subset of {@link ScrapeResult} safe to send across a structured-clone
 * boundary. `highlights` holds live DOM nodes and `patchCounts` is a Map; both
 * are only meaningful to the local debug overlay, so they are dropped before
 * messaging the background.
 */
export type SerializableScrapeResult = Omit<
  ScrapeResult,
  'highlights' | 'patchCounts'
>
