import { isCloudflareChallengePage } from './detection'
import type { PageFunnel } from './types'

export class PageEvaluator {
  constructor(
    private document: Document,
    private readonly pageFunnels: PageFunnel[],
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
    const funnels: PageFunnel[] = []

    for (const funnel of this.pageFunnels) {
      if (funnel.hostname && funnel.hostname !== url.hostname) {
        continue
      }
      if (funnel.matchesUrl(url.pathname)) {
        funnels.push(funnel)
      }
    }

    if (funnels.length === 0) {
      return { kind: 'fail', reason: 'no-matching-rule' }
    }

    return { kind: 'match', funnels }
  }
}

export type PageCheckResult = MatchingPageFunnels | NoMatchFailure

export type MatchingPageFunnels = {
  kind: 'match'
  funnels: PageFunnel[]
}

export type WellKnownFailureProvider = 'cloudflare'

export type NoMatchFailure =
  | { kind: 'fail'; reason: 'no-matching-rule' }
  | { kind: 'fail'; reason: 'not-found' }
  | {
      kind: 'fail'
      reason: 'well-known-response'
      response: WellKnownFailureProvider
    }
