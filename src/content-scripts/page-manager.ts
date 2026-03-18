import isEqual from 'lodash/isEqual'
import { onMessage, sendMessage } from 'webext-bridge/content-script'
import { HTMLParser } from '~/protocol/html-parser'
import {
  type MatchingResource,
  PageEvaluator,
} from '../protocol/page-evaluator'
import type {
  ArrayFieldDescriptor,
  JobParameters,
  JobSource,
  Resource,
  UnknownPayload,
} from '../protocol/scrapeer'

import { Timeout, timeoutReject } from '~/shared'
import { sendLog } from './content-script-log'
import { downloadCachedMedia, MediaResult } from './download-media'
import { iframeScrape } from './iframe-injector'
import { EvaluatedResource } from '~/protocol/evaluated-resource'

const JOB_FINISHED_MARKER = 'spatula:job-finished'
const ARRAY_MUTATION_DEBOUNCE_MS = 500

export class PageManager {
  evaluator: PageEvaluator
  isInIframe: boolean
  static #IFRAME_SCRAPE_TIMEOUT_MS = 10_000
  // resourceId -> arrayKey -> Set of seen primary key values
  #seenKeys = new Map<string, Map<string, Set<unknown>>>()
  #observers: MutationObserver[] = []

  constructor(
    document: Document,
    private resources: Resource[],
  ) {
    this.evaluator = new PageEvaluator(document, resources)
    this.isInIframe = window.self !== window.top
    onMessage('run-job', ({ data: params }) => this.#scrapePage(params))
    console.log('Added run-job event handler')
  }

  async run() {
    const matching = this.evaluator.checkCurrentPage()
    if (matching.kind === 'match') {
      const scrapedPage = await this.#processPage(
        document,
        matching,
        this.isInIframe
          ? { kind: 'active', id: await this.getJobId() }
          : { kind: 'passive' },
      )
      console.log(
        '[spatula:page-manager] sending page-match event',
        scrapedPage,
      )
      sendMessage('page-match', scrapedPage)
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

  updateResourcesAndRun(document: Document, resources: Resource[]) {
    if (isEqual(resources, this.resources)) {
      console.debug(
        '[spatula:page-manager] skipping rerun after resource update because nothing changed',
      )
      return
    }
    this.resources = resources
    this.evaluator = new PageEvaluator(document, resources)
    this.#seenKeys.clear()
    for (const mo of this.#observers) mo.disconnect()
    this.#observers = []
    console.debug('[spatula:page-manager] rerunning after resource update')
    this.run()
  }

  async #processPage(
    document: Document,
    { resource, variables }: MatchingResource,
    source: JobSource,
  ): Promise<ScrapedPage> {
    console.log('[spatula:page-manager] processing page...')
    await PageEvaluator.waitForLoad(document, resource, { maxWait: 10_000 })
    this.#observeArrays(document, resource, variables, source)
    const page = await this.#buildPage(document, resource, variables, source)
    window.parent?.postMessage(JOB_FINISHED_MARKER, '*')
    return page
  }

  #observeArrays(
    document: Document,
    resource: Resource,
    variables: MatchingResource['variables'],
    source: JobSource,
  ) {
    const arrayFields = this.#getArrayFields(resource)
    const hasObservableArrays = arrayFields.some(([, d]) => d.$id)
    if (!hasObservableArrays) {
      console.log('[spatula] no observable arrays for resource', resource.$id)
      return
    }

    let timer: ReturnType<typeof setTimeout> | undefined
    const mo = new MutationObserver(() => {
      clearTimeout(timer)
      timer = setTimeout(async () => {
        const page = await this.#buildPage(
          document,
          resource,
          variables,
          source,
        )
        const hasNewItems = this.#getArrayFields(resource).some(
          ([key]) =>
            Array.isArray(page.payload[key]) &&
            (page.payload[key] as unknown[]).length > 0,
        )
        if (hasNewItems) {
          sendMessage('page-match', page)
        }
      }, ARRAY_MUTATION_DEBOUNCE_MS)
    })
    mo.observe(document.body, { childList: true, subtree: true })
    this.#observers.push(mo)
  }

  async #buildPage(
    document: Document,
    resource: Resource,
    variables: MatchingResource['variables'],
    source: JobSource,
  ): Promise<ScrapedPage> {
    const parser = new HTMLParser(resource)
    const extracted = parser.parse(document)
    this.#deduplicatePayload(resource, extracted)
    const evaluated = new EvaluatedResource(resource, extracted)
    const mediaRefs = evaluated.mediaUrls()
    let media: Record<string, MediaResult> = {}
    if (mediaRefs.length > 0) {
      media = await downloadCachedMedia(mediaRefs)
    }
    return {
      resourceId: resource.$id,
      payload: extracted,
      variables,
      source,
      media,
      warnings: parser.warnings,
    }
  }

  #getArrayFields(resource: Resource): [string, ArrayFieldDescriptor][] {
    return Object.entries(resource.$fields).filter(
      (entry): entry is [string, ArrayFieldDescriptor] =>
        typeof entry[1] === 'object' &&
        entry[1] !== null &&
        '$selectorEach' in entry[1],
    )
  }

  #deduplicatePayload(resource: Resource, payload: UnknownPayload) {
    if (!this.#seenKeys.has(resource.$id)) {
      this.#seenKeys.set(resource.$id, new Map())
    }
    const seenByKey = this.#seenKeys.get(resource.$id)!

    for (const [key, descriptor] of this.#getArrayFields(resource)) {
      const primary_key = descriptor.$id
      if (!primary_key) continue
      const items = payload[key]
      if (!Array.isArray(items)) continue

      if (!seenByKey.has(key)) {
        seenByKey.set(key, new Set())
      }
      const seen = seenByKey.get(key)!

      const newItems = items.filter((item) => {
        if (!item || typeof item !== 'object') return true
        const pkValue = (item as UnknownPayload)[primary_key]
        if (pkValue === undefined || pkValue === null) return true
        const pk =
          pkValue &&
          typeof pkValue === 'object' &&
          'hash' in pkValue &&
          typeof (pkValue as any).hash === 'string'
            ? (pkValue as any).hash
            : pkValue
        if (seen.has(pk)) return false
        seen.add(pk)
        return true
      })

      payload[key] = newItems
    }
  }

  async #scrapePage(parameters: JobParameters): Promise<void> {
    if (this.isInIframe) {
      console.error(
        '[spatula:page-manager] Refusing to scrape via iframe because we are already in an iframe',
      )
      return
    }
    console.log('[spatula:page-manager] scraping external page...')
    const iframe = iframeScrape(parameters.url, parameters.id)

    this.#processIframe(iframe)
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
        timeoutReject(PageManager.#IFRAME_SCRAPE_TIMEOUT_MS),
      ])
      console.log('[spatula] iframe scrape ended. Removing frame')
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
      console.log("[spatula] iframe couldn't be scraped")
    } finally {
      iframe.remove()
    }
  }

  async getJobId() {
    const r = await chrome.storage.local.get({ currentJobId: null })
    return r.currentJobId as string
  }
}

export interface PageManagerOptions {
  document: Document
  resources: Resource[]
  onPageMatch(match: ScrapedPage): void
}

export interface ScrapedPage {
  resourceId: Resource['$id']
  source: JobSource
  payload: UnknownPayload
  variables: Record<string, unknown>
  media: Record<string, MediaResult>
  warnings: readonly string[]
}
