import type { Extractor, Resource, Selector, UnknownPayload } from './scrapeer'

export interface MediaRef {
  url: string
  hash: string
}

export class EvaluatedResource {
  constructor(
    readonly resource: Resource,
    readonly payload: UnknownPayload,
  ) {}

  mediaUrls(): MediaRef[] {
    const out: MediaRef[] = []
    this.#collectFromSelectors(this.resource.descriptors, this.payload, out)
    return out
  }

  #collectFromSelectors(
    selectors: Selector[],
    payload: UnknownPayload,
    out: MediaRef[],
  ) {
    for (const selector of selectors) {
      if (selector.kind === 'selector:array') {
        const items = payload[selector.key]
        if (!Array.isArray(items)) continue
        for (const item of items) {
          if (item && typeof item === 'object') {
            this.#collectFromSelectors(selector.fields, item as UnknownPayload, out)
          }
        }
      } else if (
        selector.kind === 'selector:node' ||
        selector.kind === 'selector:self'
      ) {
        this.#collectFromExtractors(selector.extractors, payload, out)
      }
    }
  }

  #collectFromExtractors(
    extractors: Extractor[],
    payload: UnknownPayload,
    out: MediaRef[],
  ) {
    for (const extractor of extractors) {
      if (!extractor.transformers) continue
      if (!extractor.transformers.some((t) => t.kind === 'transformer:media')) continue
      const value = payload[extractor.key]
      if (
        value &&
        typeof value === 'object' &&
        'url' in value &&
        'hash' in value &&
        typeof value.url === 'string' &&
        typeof value.hash === 'string'
      ) {
        out.push({ url: value.url, hash: value.hash })
      }
    }
  }
}
