import { createExpr, type HtmlegyExpr } from '@tide/htmlegy-dom'
import { PageEvaluator } from '@tide/spec'
import type { JobSource, PageFunnel } from '@tide/spec'
import { EntityValidator } from '@tide/spec'
import type { HighlightEntry, ScrapeResult } from '@tide/spec'
import type { ScrapeLogger } from './host'

const PASSIVE_JOB: JobSource = { kind: 'passive' }

class PageRuleRunner {
  readonly rule: PageFunnel
  #validator: EntityValidator
  #dispose: (() => void) | null = null
  #highlights: HighlightEntry[] = []
  #pendingReset = false
  #fn: HtmlegyExpr<Element>

  constructor(rule: PageFunnel, validator: EntityValidator) {
    this.rule = rule
    this.#validator = validator
    this.#fn = createExpr(rule.source, {
      onElement: (element, label, isArrayItem) => {
        if (this.#pendingReset) {
          this.#highlights = []
          this.#pendingReset = false
        }
        this.#highlights.push({ element, label, isArrayItem })
      },
    })
  }

  async run(
    doc: Document,
    generation: number,
    currentGeneration: () => number,
    onResult: (result: ScrapeResult) => void,
  ): Promise<void> {
    this.#highlights = []
    this.#pendingReset = false

    const emit = (value: unknown) => {
      if (currentGeneration() !== generation) {
        return
      }
      const { patches, errors } = this.#validator.parsePatches(value)
      const { patches: withIdentity, warnings } =
        this.#validator.applyIdentityExprs(patches)
      const validated = this.#validator.applyCanonicalUrls(withIdentity)

      const patchCounts = new Map<string, number>()
      for (const patch of validated) {
        patchCounts.set(
          patch._entity,
          (patchCounts.get(patch._entity) ?? 0) + 1,
        )
      }

      const url = Array.isArray(this.rule.url)
        ? this.rule.url[0]!
        : this.rule.url

      onResult({
        patches: validated,
        highlights: this.#highlights,
        patchCounts,
        errors,
        warnings: warnings.map((w) => w.message),
        scrapeSource: {
          kind: 'page',
          site: this.rule.site,
          url,
          funnel: this.rule.name,
          file: this.rule.file,
          format: 'htmlegy',
          label: this.rule.label,
        },
      })
    }

    if (this.#fn.isReactive) {
      const reactive = this.#fn.reactive(doc.documentElement)
      let lastSerialized: string | null = null
      this.#dispose = reactive.subscribe((value) => {
        const serialized = JSON.stringify(value)
        if (serialized === lastSerialized) {
          return
        }
        lastSerialized = serialized
        this.#pendingReset = true
        emit(value)
      })
    } else {
      emit(await this.#fn.run(doc.documentElement))
    }
  }

  stop(): void {
    this.#dispose?.()
    this.#dispose = null
  }
}

export class HtmlPageSource {
  #document: Document
  #evaluator: PageEvaluator
  #runners: Map<PageFunnel, PageRuleRunner>
  #validator: EntityValidator
  #runGeneration = 0
  #onEmit: (result: ScrapeResult) => void
  #logger: ScrapeLogger
  #activeRunners: Set<PageRuleRunner> = new Set()

  constructor(
    document: Document,
    pageFunnels: PageFunnel[],
    validator: EntityValidator,
    logger: ScrapeLogger,
    onEmit: (result: ScrapeResult) => void,
  ) {
    this.#document = document
    this.#validator = validator
    this.#logger = logger
    this.#onEmit = onEmit
    this.#evaluator = new PageEvaluator(document, pageFunnels)
    this.#runners = this.#buildRunners(pageFunnels)
  }

  start(): void {
    this.#run()
  }

  stop(): void {
    for (const runner of this.#activeRunners) {
      runner.stop()
    }
    this.#activeRunners.clear()
    this.#runGeneration++
  }

  updateRules(pageFunnels: PageFunnel[]): void {
    this.#evaluator = new PageEvaluator(this.#document, pageFunnels)
    this.#runners = this.#buildRunners(pageFunnels)
    this.stop()
    this.#run()
  }

  #buildRunners(pageFunnels: PageFunnel[]): Map<PageFunnel, PageRuleRunner> {
    const map = new Map<PageFunnel, PageRuleRunner>()
    for (const funnel of pageFunnels) {
      map.set(funnel, new PageRuleRunner(funnel, this.#validator))
    }
    return map
  }

  #handleResult(result: ScrapeResult): void {
    this.#onEmit({ ...result, source: PASSIVE_JOB })
  }

  async #run(): Promise<void> {
    const generation = ++this.#runGeneration
    const currentGeneration = () => this.#runGeneration

    const matching = this.#evaluator.checkCurrentPage()
    if (matching.kind === 'match') {
      await Promise.all(
        matching.funnels.map((funnel) => {
          const runner = this.#runners.get(funnel)!
          this.#activeRunners.add(runner)
          return runner.run(
            this.#document,
            generation,
            currentGeneration,
            (result) => this.#handleResult(result),
          )
        }),
      )
    } else if (matching.kind === 'fail' && matching.reason !== 'no-matching-rule') {
      this.#logger.log({
        severity: 'error',
        text: 'Page check failed during scrape',
        data: {
          url: this.#document.URL,
          response: matching,
        },
      })
    }
  }
}
