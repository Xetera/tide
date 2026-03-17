import { isCloudflareChallengePage } from './detection'
import type { ArraySelector, NodeSelector, Resource } from './scrapeer'
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

  #observeNode(
    descriptor: NodeSelector,
    mo: MutationObserver,
    parent?: HTMLElement,
  ): void {
    if (!parent && !descriptor.selector) {
      throw new Error(
        'Node selectors at the root level must have a selector to be observable',
      )
    }

    const target = parent ?? this.document.documentElement
    const element = descriptor.selector
      ? target.querySelector(descriptor.selector)
      : target
    if (!element) {
      throw new Error(`No node was found for selector ${descriptor.selector}`)
    }

    const isAttributeExtractor = descriptor.extractors.some(
      (extractor) => extractor.kind === 'extractor:attribute',
    )

    const isTextExtractor = descriptor.extractors.some(
      (extractor) => extractor.kind === 'extractor:text',
    )

    mo.observe(element, {
      childList: true,
      subtree: isTextExtractor,
      attributes: isAttributeExtractor,
      attributeFilter: isAttributeExtractor
        ? descriptor.extractors.reduce((acc, extractor) => {
            if (extractor.kind === 'extractor:attribute') {
              acc.push(extractor.attribute)
            }
            return acc
          }, [] as string[])
        : undefined,
    })
  }

  #observeArray(descriptor: ArraySelector, mo: MutationObserver): void {
    // const allElements = this.document.querySelectorAll(descriptor.selector)
    // for (const element of allElements) {
    //   for (const field of descriptor.fields) {
    //     if (field.kind === "selector:node") {
    //     this.#observeNode(field, mo, element as HTMLElement)
    //     }
    //   }
    // }
    // const [firstElement] = allElements
    // if (firstElement) {
    //   mo.observe(firstElement.parentNode as Node, {
    //     childList: true,
    //   })
    // }
  }

  private matchingHosts(url: URL): readonly Resource[] {
    return Object.freeze(
      this.resources.filter((resource) => {
        return url.hostname === resource.hostname
      }),
    )
  }

  static normalizePath(path: string): string {
    return path.replace(/\/$/, '')
  }

  static waitForLoad(
    document: Document,
    resource: Resource,
    { timeout = 500, maxWait = 10_000 }: { timeout?: number; maxWait?: number },
  ): Promise<{ readyAfterTries: number }> {
    const deadline = Date.now() + maxWait
    function go(count: number) {
      return new Promise<{ readyAfterTries: number }>((resolve, reject) => {
        const out = { readyAfterTries: count }
        if (!resource.wait_for) {
          return resolve(out)
        }

        const isLoaded = resource.wait_for.some((selector) => {
          return document.querySelector(selector) !== null
        })

        if (!isLoaded) {
          if (Date.now() >= deadline) {
            return resolve(out)
          }
          setTimeout(() => {
            go(count + 1).then(resolve, reject)
          }, timeout)
          return
        }

        return resolve(out)
      })
    }
    return go(0)
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
