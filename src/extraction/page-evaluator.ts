import { isCloudflareChallengePage } from './detection'
import type { PageFunnel } from '~/site-spec/types'

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

    for (const funnel of this.pageFunnels) {
      if (funnel.matchesUrl(url.pathname)) {
        return { kind: 'match', funnel }
      }
    }

    return { kind: 'fail', reason: 'no-matching-rule' }
  }
}

export type PageCheckResult = MatchingPageFunnel | NoMatchFailure

export type MatchingPageFunnel = {
  kind: 'match'
  funnel: PageFunnel
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
