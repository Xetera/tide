import { onMessage } from 'webext-bridge/content-script'
import { type HighlightEntry, HTMLParser } from '~/extraction/html-parser'
import {
  type MatchingResource,
  PageEvaluator,
} from '~/extraction/page-evaluator'
import { EvaluatedResource } from '~/extraction/evaluated-resource'
import type {
  RawEntityPatch,
  JobParameters,
  JobSource,
  PageSpec,
} from '~/site-spec/types'
import { Timeout, timeoutReject } from '~/shared'
import { sendLog } from './content-script-log'
import type { DataSource, SourceEmission } from './data-source'
import { downloadCachedMedia } from './download-media'
import { iframeScrape } from './iframe-injector'

const JOB_FINISHED_MARKER = 'spatula:job-finished'
const ARRAY_MUTATION_DEBOUNCE_MS = 500
const IFRAME_SCRAPE_TIMEOUT_MS = 10_000

export class HtmlPageSource implements DataSource {
  #evaluator: PageEvaluator
  #resources: PageSpec[]
  #observers: MutationObserver[] = []
  #runGeneration = 0
  #lastHighlights: readonly HighlightEntry[] = []
  #onHighlightsChanged?: (highlights: readonly HighlightEntry[]) => void
  #onEmit: (emission: SourceEmission) => void

  readonly isInIframe: boolean

  get lastHighlights(): readonly HighlightEntry[] {
    return this.#lastHighlights
  }

  set onHighlightsChanged(cb: (highlights: readonly HighlightEntry[]) => void) {
    this.#onHighlightsChanged = cb
  }

  constructor(
    resources: PageSpec[],
    onEmit: (emission: SourceEmission) => void,
  ) {
    this.#resources = resources
    this.#evaluator = new PageEvaluator(document, resources)
    this.isInIframe = window.self !== window.top
    this.#onEmit = onEmit
    onMessage('run-job', ({ data: params }) => this.#scrapePage(params))
  }

  start() {
    this.#run()
  }

  stop() {
    for (const mo of this.#observers) {
      mo.disconnect()
    }
    this.#observers = []
    this.#runGeneration++
  }

  updateResources(resources: PageSpec[]) {
    if (JSON.stringify(resources) === JSON.stringify(this.#resources)) {
      return
    }
    this.#resources = resources
    this.#evaluator = new PageEvaluator(document, resources)
    this.stop()
    this.#run()
  }

  async #run() {
    this.#lastHighlights = []
    this.#onHighlightsChanged?.(this.#lastHighlights)
    const generation = ++this.#runGeneration
    const matching = this.#evaluator.checkCurrentPage()
    if (matching.kind === 'match') {
      const source: JobSource = this.isInIframe
        ? { kind: 'active', id: await this.#getJobId() }
        : { kind: 'passive' }
      await this.#processPage(document, matching, source, generation)
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

  async #processPage(
    doc: Document,
    matching: MatchingResource,
    source: JobSource,
    generation: number,
  ) {
    await PageEvaluator.waitForLoad(doc, matching.resource, { maxWait: 10_000 })
    if (this.#runGeneration !== generation) {
      return
    }
    this.#observeMutations(doc, matching, source, generation)
    await this.#buildAndEmit(doc, matching, source, generation)
  }

  #observeMutations(
    doc: Document,
    matching: MatchingResource,
    source: JobSource,
    generation: number,
  ) {
    let timer: ReturnType<typeof setTimeout> | undefined
    const mo = new MutationObserver(() => {
      clearTimeout(timer)
      timer = setTimeout(async () => {
        if (this.#runGeneration !== generation) {
          return
        }
        await this.#buildAndEmit(doc, matching, source, generation)
      }, ARRAY_MUTATION_DEBOUNCE_MS)
    })
    mo.observe(doc.body, { childList: true, subtree: true })
    this.#observers.push(mo)
  }

  async #buildAndEmit(
    doc: Document,
    { resource }: MatchingResource,
    source: JobSource,
    generation: number,
  ) {
    const parser = new HTMLParser(resource)
    const patches = await parser.parseAsync(doc)
    if (this.#runGeneration === generation) {
      this.#lastHighlights = parser.highlights
      this.#onHighlightsChanged?.(this.#lastHighlights)
    }

    const evaluated = new EvaluatedResource(resource, patches)
    const mediaRefs = evaluated.mediaUrls()
    let resolvedPatches: RawEntityPatch[] = patches
    if (mediaRefs.length > 0) {
      await Promise.all(mediaRefs.map((ref) => parser.mediaReady.get(ref.hash)))
      const downloaded = await downloadCachedMedia(mediaRefs)
      resolvedPatches = evaluated.substituteMediaRefs(downloaded)
    }

    if (this.#runGeneration !== generation) {
      return
    }
    this.#onEmit({
      patches: resolvedPatches,
      source,
      warnings: [...parser.warnings],
    })
  }

  async #scrapePage(parameters: JobParameters) {
    if (this.isInIframe) {
      console.error(
        '[spatula:html-page-source] Refusing to scrape via iframe because we are already in an iframe',
      )
      return
    }
    const iframe = iframeScrape(parameters.url, parameters.id)
    await this.#processIframe(iframe)
  }

  async #processIframe(iframe: HTMLIFrameElement) {
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

  async #getJobId() {
    const r = await chrome.storage.local.get({ currentJobId: null })
    return r.currentJobId as string
  }
}
