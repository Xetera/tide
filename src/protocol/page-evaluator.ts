import { isCloudflareChallengePage } from './detection'
import type { Resource } from './scrapeer'
import { parseVariables } from './shared'

export class PageEvaluator {
  constructor(
    private document: Document,
    private readonly resources: Resource[],
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

  observe(resource: Resource, fn: MutationCallback): MutationObserver {
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


  private matchingHosts(url: URL): readonly Resource[] {
    return Object.freeze(
      this.resources.filter((resource) => {
        return url.hostname === resource.$hostname
      }),
    )
  }

  static normalizePath(path: string): string {
    return path.replace(/\/$/, '')
  }

  static waitForLoad(
    document: Document,
    resource: Resource,
    { maxWait = 10_000 }: { maxWait?: number } = {},
  ): Promise<void> {
    if (!resource.$waitFor?.length) return Promise.resolve()

    const selectors = resource.$waitFor
    const isLoaded = () =>
      selectors.every((s) => document.querySelector(s) !== null)

    if (isLoaded()) return Promise.resolve()

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
  resource: Resource
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
