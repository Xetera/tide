import { onMessage } from 'webext-bridge/content-script'
import { PageEvaluator } from '~/extraction/page-evaluator'
import type { JobParameters, JobSource, PageLoader } from '~/site-spec/types'
import { EntityValidator } from '~/extraction/entity-validator'
import { Timeout, timeoutReject } from '~/shared'
import { sendLog } from './content-script-log'
import { iframeScrape } from './iframe-injector'
import { PageRuleRunner } from './page-rule-runner'
import type { ScrapeResult } from './page-rule-runner'

const JOB_FINISHED_MARKER = 'spatula:job-finished'
const IFRAME_SCRAPE_TIMEOUT_MS = 10_000

export class HtmlPageSource {
  #evaluator: PageEvaluator
  #runners: Map<PageLoader, PageRuleRunner>
  #validator: EntityValidator
  #runGeneration = 0
  #onEmit: (result: ScrapeResult) => void
  #activeRunner: PageRuleRunner | null = null
  readonly isInIframe: boolean

  constructor(
    pageLoaders: PageLoader[],
    validator: EntityValidator,
    onEmit: (result: ScrapeResult) => void,
  ) {
    this.#validator = validator
    this.#onEmit = onEmit
    this.#evaluator = new PageEvaluator(document, pageLoaders)
    this.#runners = this.#buildRunners(pageLoaders)
    this.isInIframe = window.self !== window.top
    onMessage('run-job', ({ data: params }) => this.#scrapePage(params))
  }

  start(): void {
    this.#run()
  }

  stop(): void {
    this.#activeRunner?.stop()
    this.#activeRunner = null
    this.#runGeneration++
  }

  updateRules(pageLoaders: PageLoader[]): void {
    this.#evaluator = new PageEvaluator(document, pageLoaders)
    this.#runners = this.#buildRunners(pageLoaders)
    this.stop()
    this.#run()
  }

  #buildRunners(pageLoaders: PageLoader[]): Map<PageLoader, PageRuleRunner> {
    const map = new Map<PageLoader, PageRuleRunner>()
    for (const loader of pageLoaders) {
      map.set(loader, new PageRuleRunner(loader, this.#validator))
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
        `[spatula] matched page loader: ${matching.loader.urlPattern} for ${document.URL}`,
      )
      const jobSource: JobSource = this.isInIframe
        ? { kind: 'active', id: await this.#getJobId() }
        : { kind: 'passive' }
      const runner = this.#runners.get(matching.loader)!
      this.#activeRunner = runner
      runner.run(document, jobSource, generation, currentGeneration, (result) =>
        this.#handleResult(result, jobSource),
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
        '[spatula:html-page-source] Refusing to scrape via iframe because we are already in an iframe',
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
