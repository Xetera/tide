import { compile } from '~/htmlevate/compiler'
import type { PageLoader, JobSource, EntityPatch } from '~/site-spec/types'
import type { EntityValidator, EntityValidationError } from '~/extraction/entity-validator'
import type { ScrapeSource } from '~/shared'

export interface HighlightLabel {
  entity: string
  field: string
}

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

export class PageRuleRunner {
  readonly rule: PageLoader
  #validator: EntityValidator
  #dispose: (() => void) | null = null
  #highlights: HighlightEntry[] = []
  #pendingReset = false
  #fn: ReturnType<typeof compile>

  constructor(rule: PageLoader, validator: EntityValidator) {
    this.rule = rule
    this.#validator = validator
    this.#fn = compile(rule.source, {
      onElement: (element, label, isArrayItem) => {
        if (this.#pendingReset) {
          this.#highlights = []
          this.#pendingReset = false
        }
        this.#highlights.push({ element, label, isArrayItem })
      },
    })
  }

  run(
    doc: Document,
    jobSource: JobSource,
    generation: number,
    currentGeneration: () => number,
    onResult: (result: ScrapeResult) => void,
  ): void {
    this.#highlights = []
    this.#pendingReset = false

    const emit = (value: unknown) => {
      if (currentGeneration() !== generation) {
        return
      }
      const { patches, errors } = this.#validator.parsePatches(value)
      const { patches: validated, warnings } = this.#validator.applyIdentityExprs(patches)

      const patchCounts = new Map<string, number>()
      for (const patch of validated) {
        patchCounts.set(patch._entity, (patchCounts.get(patch._entity) ?? 0) + 1)
      }

      const urlPattern = Array.isArray(this.rule.urlPattern)
        ? this.rule.urlPattern[0]!
        : this.rule.urlPattern

      onResult({
        patches: validated,
        highlights: this.#highlights,
        patchCounts,
        errors,
        warnings: warnings.map((w) => w.message),
        scrapeSource: { kind: 'page', urlPattern, loader: this.rule.name, file: this.rule.file },
      })
    }

    if (this.#fn.reactive) {
      const reactive = this.#fn.reactive(doc.documentElement)
      this.#dispose = reactive.subscribe((value) => {
        this.#pendingReset = true
        emit(value)
      })
    } else {
      emit(this.#fn(doc.documentElement))
    }
  }

  stop(): void {
    this.#dispose?.()
    this.#dispose = null
  }
}
