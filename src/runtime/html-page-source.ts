import { onMessage } from 'webext-bridge/content-script'
import { createExpr, type HtmlegyExpr } from '@tide/htmlegy-dom'
import { PageEvaluator } from '~/funnels/page-evaluator'
import type { JobParameters, JobSource, PageFunnel } from '~/funnels/types'
import { EntityValidator } from '~/funnels/entity-validator'
import { Timeout, timeoutReject } from '~/shared/uid'
import { sendLog } from './debug/content-script-log'
import { iframeScrape } from './debug/iframe-injector'
import type { HighlightEntry, ScrapeResult } from '~/funnels/scrape-result'

export type { ScrapeResult }

const JOB_FINISHED_MARKER = 'tide:job-finished'
const IFRAME_SCRAPE_TIMEOUT_MS = 10_000

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
    jobSource: JobSource,
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
      const { patches: validated, warnings } =
        this.#validator.applyIdentityExprs(patches)

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
  #evaluator: PageEvaluator
  #runners: Map<PageFunnel, PageRuleRunner>
  #validator: EntityValidator
  #runGeneration = 0
  #onEmit: (result: ScrapeResult) => void
  #activeRunners: Set<PageRuleRunner> = new Set()
  readonly isInIframe: boolean

  constructor(
    pageFunnels: PageFunnel[],
    validator: EntityValidator,
    onEmit: (result: ScrapeResult) => void,
  ) {
    this.#validator = validator
    this.#onEmit = onEmit
    this.#evaluator = new PageEvaluator(document, pageFunnels)
    this.#runners = this.#buildRunners(pageFunnels)
    this.isInIframe = window.self !== window.top
    onMessage('run-job', ({ data: params }) => this.#scrapePage(params))
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
    this.#evaluator = new PageEvaluator(document, pageFunnels)
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

  #handleResult(result: ScrapeResult, jobSource: JobSource): void {
    this.#onEmit({ ...result, source: jobSource })
  }

  async #run(): Promise<void> {
    const generation = ++this.#runGeneration
    const currentGeneration = () => this.#runGeneration

    const matching = this.#evaluator.checkCurrentPage()
    console.log('matching', matching)
    if (matching.kind === 'match') {
      console.log(
        `[tide] matched ${matching.funnels.length} page funnel(s) for ${document.URL}: ${matching.funnels.map((f) => f.url).join(', ')}`,
      )
      const jobSource: JobSource = this.isInIframe
        ? { kind: 'active', id: await this.#getJobId() }
        : { kind: 'passive' }
      await Promise.all(
        matching.funnels.map((funnel) => {
          const runner = this.#runners.get(funnel)!
          this.#activeRunners.add(runner)
          return runner.run(
            document,
            jobSource,
            generation,
            currentGeneration,
            (result) => this.#handleResult(result, jobSource),
          )
        }),
      )
      window.parent?.postMessage(JOB_FINISHED_MARKER, '*')
    } else if (matching.kind === 'fail' && this.isInIframe) {
      sendLog({
        text: 'Did not get a matching page when scraping within an iframe',
        severity: 'error',
        data: {
          url: window.location.href.toString(),
          response: matching,
        },
      })
    }
  }

  async #scrapePage(parameters: JobParameters): Promise<void> {
    if (this.isInIframe) {
      console.error(
        '[tide:html-page-source] Refusing to scrape via iframe because we are already in an iframe',
      )
      return
    }
    const iframe = iframeScrape(parameters.url, parameters.id)
    await this.#processIframe(iframe)
  }

  async #processIframe(iframe: HTMLIFrameElement): Promise<void> {
    const { promise: iframeSuccess, resolve } = Promise.withResolvers<void>()
    const irrelevantMessages: unknown[] = []
    function eventHandler(evt: MessageEvent<unknown>) {
      if (evt.data === JOB_FINISHED_MARKER) {
        resolve()
        window.removeEventListener('message', eventHandler)
      } else {
        irrelevantMessages.push(evt.data)
      }
    }
    window.addEventListener('message', eventHandler)

    try {
      await Promise.race([
        iframeSuccess,
        timeoutReject(IFRAME_SCRAPE_TIMEOUT_MS),
      ])
    } catch (err) {
      if (err instanceof Timeout) {
        if (irrelevantMessages.length > 0) {
          sendLog({
            severity: 'error',
            text: 'Timed out while waiting for an iframe marker. Received unexpected messages while waiting',
            data: { messages: JSON.stringify(irrelevantMessages) },
          })
        } else {
          sendLog({
            severity: 'error',
            text: 'Timed out while waiting for an iframe marker. Received no events',
          })
        }
      }
    } finally {
      iframe.remove()
    }
  }

  async #getJobId(): Promise<string> {
    const r = await chrome.storage.local.get({ currentJobId: null })
    return r.currentJobId as string
  }
}
