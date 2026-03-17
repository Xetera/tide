import isEqual from 'lodash/isEqual'
import { onMessage, sendMessage } from 'webext-bridge/content-script'
import { HTMLParser } from '~/protocol/html-parser'
import {
  type MatchingResource,
  PageEvaluator,
} from '../protocol/page-evaluator'
import type {
  JobParameters,
  JobSource,
  Resource,
  UnknownPayload,
} from '../protocol/scrapeer'

import { Timeout, timeoutReject } from '~/shared'
import { sendLog } from './content-script-log'
import { iframeScrape } from './iframe-injector'

const JOB_FINISHED_MARKER = 'spatula:job-finished'

export class PageManager {
  evaluator: PageEvaluator
  isInIframe: boolean
  static #IFRAME_SCRAPE_TIMEOUT_MS = 10_000

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
      const resources = await this.#processPage(document, matching, {
        ...(this.isInIframe
          ? { kind: 'active', id: await this.getJobId() }
          : { kind: 'passive' }),
      })
      console.log('[spatula:page-manager] sending page-match event')
      sendMessage('page-match', resources)
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
    console.debug('[spatula:page-manager] rerunning after resource update')
    this.run()
  }

  async #processPage(
    document: Document,
    { resource, variables }: MatchingResource,
    source: JobSource,
  ): Promise<ScrapedPage> {
    console.log('[spatula:page-manager] processing page...')
    const parser = new HTMLParser(resource)
    await PageEvaluator.waitForLoad(document, resource, { timeout: 500, maxWait: 10_000 })
    const extracted = parser.parse(document)
    const out = {
      resourceId: resource.id,
      payload: extracted,
      variables,
      source,
      warnings: parser.warnings,
    }
    console.log('source', source)
    // in case we're in an iframe, we want to let the parent know
    window.parent?.postMessage(JOB_FINISHED_MARKER, '*')
    return out
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
  resourceId: Resource['id']
  source: JobSource
  payload: UnknownPayload
  variables: Record<string, unknown>
  warnings: readonly string[]
}
