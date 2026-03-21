import { isCloudflareChallengePage } from './detection'
import type { PageSpec } from './scrapeer'
import { parseVariables } from './shared'

export class PageEvaluator {
  constructor(
    private document: Document,
    private readonly resources: PageSpec[],
  ) {}

  updateDocument(document: Document) {
    this.document = document
  }

  checkCurrentPage(): PageCheckResult {
    if (isCloudflareChallengePage(this.document)) {
      return {
        kind: 'fail',
        reason: 'well-known-response',
        response: 'cloudflare',
      }
    }

    const url = new URL(this.document.URL)
    const validResources = this.matchingHosts(url)
    for (const resource of validResources) {
      const variables = parseVariables(resource, url)
      if (!variables) {
        continue
      }

      return {
        kind: 'match',
        resource,
        variables,
      }
    }
    return {
      kind: 'fail',
      reason: 'no-matching-resource',
    }
  }

  observe(resource: PageSpec, fn: MutationCallback): MutationObserver {
    const mo = new MutationObserver(fn)
    // for (const descriptor of resource.descriptors) {
    //   if (descriptor.kind === 'selector:array') {
    //     this.#observeArray(descriptor, mo)
    //   } else if (descriptor.kind === 'selector:node') {
    //     this.#observeNode(descriptor, mo)
    //   }
    // }
    return mo
  }

  private matchingHosts(url: URL): readonly PageSpec[] {
    return Object.freeze(
      this.resources
        .filter((resource) => url.hostname === resource.$hostname)
        .sort((a, b) => {
          const segments = (p: string | string[]) => {
            const patterns = Array.isArray(p) ? p : [p]
            return Math.max(...patterns.map((s) => s.split('/').length))
          }
          return segments(b.$urlPattern) - segments(a.$urlPattern)
        }),
    )
  }

  static normalizePath(path: string): string {
    return path.replace(/\/$/, '')
  }

  static waitForLoad(
    document: Document,
    resource: PageSpec,
    { maxWait = 10_000 }: { maxWait?: number } = {},
  ): Promise<void> {
    if (!resource.$waitFor || resource.$waitFor.length === 0)
      return Promise.resolve()

    const selectors = resource.$waitFor
    const isLoaded = () =>
      selectors.some((s) => document.querySelector(s) !== null)

    if (isLoaded()) {
      return Promise.resolve()
    }

    return new Promise((resolve) => {
      const cleanup = () => {
        mo.disconnect()
        clearTimeout(timer)
      }
      const mo = new MutationObserver(() => {
        if (isLoaded()) {
          cleanup()
          resolve()
        }
      })
      const timer = setTimeout(() => {
        console.log('resolved after default timeout:', maxWait)
        cleanup()
        resolve()
      }, maxWait)
      mo.observe(document.documentElement, { childList: true, subtree: true })
    })
  }
}

export type PageCheckResult = MatchingResource | NoMatchFailure

export type MatchingResource = {
  kind: 'match'
  resource: PageSpec
  variables: Record<string, unknown>
}

export type NoMatchFailure =
  | {
      kind: 'fail'
      reason: 'no-matching-resource'
    }
  | { kind: 'fail'; reason: 'not-found' }
  | {
      kind: 'fail'
      reason: 'well-known-response'
      response: 'cloudflare'
    }
