import { onMessage } from 'webext-bridge/content-script'
import { type HighlightEntry, HTMLParser } from '~/extraction/html-parser'
import {
  type MatchingHtmlEvatePage,
  type MatchingResource,
  PageEvaluator,
} from '~/extraction/page-evaluator'
import { EvaluatedResource } from '~/extraction/evaluated-resource'
import { EntityValidator } from '~/extraction/entity-validator'
import type {
  HtmlEvatePage,
  HtmlEvateLoader,
  RawEntityPatch,
  JobParameters,
  JobSource,
  PageSpec,
  SiteDefinition,
} from '~/site-spec/types'
import { compile } from '~/htmlevate/compiler'
import type { EntityValidationError } from '~/extraction/entity-validator'
import { matchesGlob } from '~/extraction/glob'
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
  #validator: EntityValidator
  #resources: PageSpec[]
  #htmlevatePages: HtmlEvatePage[]
  #htmlevateLoaders: HtmlEvateLoader[]
  #observers: MutationObserver[] = []
  #runGeneration = 0
  #lastHighlights: readonly HighlightEntry[] = []
  #lastPatchCounts: Map<string, number> = new Map()
  #lastErrors: EntityValidationError[] = []
  #onHighlightsChanged?: (highlights: readonly HighlightEntry[], patchCounts: Map<string, number>, errors: EntityValidationError[]) => void
  #onEmit: (emission: SourceEmission) => void

  readonly isInIframe: boolean

  get lastHighlights(): readonly HighlightEntry[] {
    return this.#lastHighlights
  }

  get lastPatchCounts(): Map<string, number> {
    return this.#lastPatchCounts
  }

  get lastErrors(): EntityValidationError[] {
    return this.#lastErrors
  }

  set onHighlightsChanged(cb: (highlights: readonly HighlightEntry[], patchCounts: Map<string, number>, errors: EntityValidationError[]) => void) {
    this.#onHighlightsChanged = cb
  }

  constructor(
    resources: PageSpec[],
    htmlevatePages: HtmlEvatePage[],
    htmlevateLoaders: HtmlEvateLoader[],
    sites: SiteDefinition[],
    onEmit: (emission: SourceEmission) => void,
  ) {
    this.#resources = resources
    this.#htmlevatePages = htmlevatePages
    this.#htmlevateLoaders = htmlevateLoaders
    this.#validator = new EntityValidator(sites)
    this.#evaluator = new PageEvaluator(document, resources, htmlevatePages)
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

  updateResources(
    resources: PageSpec[],
    htmlevatePages: HtmlEvatePage[] = this.#htmlevatePages,
    htmlevateLoaders: HtmlEvateLoader[] = this.#htmlevateLoaders,
  ) {
    if (
      JSON.stringify(resources) === JSON.stringify(this.#resources) &&
      JSON.stringify(htmlevatePages) === JSON.stringify(this.#htmlevatePages) &&
      JSON.stringify(htmlevateLoaders) === JSON.stringify(this.#htmlevateLoaders)
    ) {
      return
    }
    this.#resources = resources
    this.#htmlevatePages = htmlevatePages
    this.#htmlevateLoaders = htmlevateLoaders
    this.#evaluator = new PageEvaluator(document, resources, htmlevatePages)
    this.stop()
    this.#run()
  }

  #matchingLoader(): HtmlEvateLoader | undefined {
    const url = new URL(document.URL)
    return this.#htmlevateLoaders.find(
      (loader) =>
        url.hostname === loader.hostname &&
        matchesGlob(loader.urlPattern, url.pathname),
    )
  }

  async #run() {
    this.#lastHighlights = []
    this.#onHighlightsChanged?.(this.#lastHighlights, this.#lastPatchCounts, this.#lastErrors)
    const generation = ++this.#runGeneration
    const loader = this.#matchingLoader()
    if (loader) {
      console.log(
        `[spatula] matched htmlevate loader: "${loader.name}" for ${document.URL}`,
      )
      const source: JobSource = this.isInIframe
        ? { kind: 'active', id: await this.#getJobId() }
        : { kind: 'passive' }
      await this.#runHtmlevateLoader(document, loader, source, generation)
      window.parent?.postMessage(JOB_FINISHED_MARKER, '*')
      return
    }
    const matching = this.#evaluator.checkCurrentPage()
    if (matching.kind === 'match') {
      console.log(
        `[spatula] matched page spec: ${matching.resource.$entity} for ${document.URL}`,
      )
      const source: JobSource = this.isInIframe
        ? { kind: 'active', id: await this.#getJobId() }
        : { kind: 'passive' }
      await this.#processPage(document, matching, source, generation)
      window.parent?.postMessage(JOB_FINISHED_MARKER, '*')
    } else if (matching.kind === 'htmlevate') {
      console.log(
        `[spatula] matched htmlevate page: ${matching.page.$entity} for ${document.URL}`,
      )
      const source: JobSource = this.isInIframe
        ? { kind: 'active', id: await this.#getJobId() }
        : { kind: 'passive' }
      await this.#processHtmlevatePage(document, matching, source, generation)
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

  async #runHtmlevateLoader(
    doc: Document,
    loader: HtmlEvateLoader,
    source: JobSource,
    generation: number,
  ) {
    const highlights: HighlightEntry[] = []
    const fn = compile(loader.source, {
      onElement(element, label, isArrayItem) {
        highlights.push({ element, label, isArrayItem })
      },
    })
    const result = fn(doc.documentElement)
    if (this.#runGeneration !== generation) {
      return
    }
    this.#lastHighlights = highlights
    const asArray = Array.isArray(result) ? result : [result]
    const { patches, errors } = this.#validator.parsePatches(asArray)
    const { patches: validated, warnings } =
      this.#validator.applyIdentityExprs(patches)
    const patchCounts = new Map<string, number>()
    for (const patch of validated) {
      patchCounts.set(patch._entity, (patchCounts.get(patch._entity) ?? 0) + 1)
    }
    this.#lastPatchCounts = patchCounts
    this.#lastErrors = errors
    this.#onHighlightsChanged?.(this.#lastHighlights, patchCounts, errors)
    if (errors.length > 0) {
      console.warn(
        `[spatula] htmlevate loader "${loader.name}" validation errors`,
        errors,
      )
    }
    console.log(
      `[spatula] htmlevate loader "${loader.name}" produced ${validated.length} patches`,
      validated,
    )
    this.#onEmit({
      patches: validated,
      source,
      warnings: warnings.map((w) => w.message),
      scrapeSource: { kind: 'htmlevate-loader', loader: loader.name },
    })
  }

  async #processHtmlevatePage(
    doc: Document,
    matching: MatchingHtmlEvatePage,
    source: JobSource,
    generation: number,
  ) {
    await this.#buildAndEmitHtmlevate(doc, matching, source, generation)
  }

  async #buildAndEmitHtmlevate(
    doc: Document,
    { page }: MatchingHtmlEvatePage,
    source: JobSource,
    generation: number,
  ) {
    const highlights: HighlightEntry[] = []
    const fn = compile(page.source, {
      onElement: (element, label, isArrayItem) => {
        highlights.push({ element, label, isArrayItem })
      },
    })
    const result = fn(doc.documentElement)
    if (this.#runGeneration !== generation) {
      return
    }
    this.#lastHighlights = highlights
    this.#onHighlightsChanged?.(this.#lastHighlights, this.#lastPatchCounts, this.#lastErrors)
    const patches = htmlevateResultToPatches(result, page.$entity)
    this.#onEmit({
      patches,
      source,
      warnings: [],
      scrapeSource: { kind: 'htmlevate-page', entity: page.$entity },
    })
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
      this.#onHighlightsChanged?.(this.#lastHighlights, this.#lastPatchCounts, this.#lastErrors)
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

function htmlevateResultToPatches(
  result: unknown,
  fallbackEntity?: string,
): RawEntityPatch[] {
  if (Array.isArray(result)) {
    return result.filter(
      (item): item is RawEntityPatch =>
        typeof item === 'object' && item !== null && '_entity' in item,
    )
  }
  if (typeof result === 'object' && result !== null && '_entity' in result) {
    return [result as RawEntityPatch]
  }
  if (typeof result === 'object' && result !== null && fallbackEntity) {
    return [
      {
        _entity: fallbackEntity,
        _id: '',
        ...(result as Record<string, unknown>),
      },
    ]
  }
  return []
}
