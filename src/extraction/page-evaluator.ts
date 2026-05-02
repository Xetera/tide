import { isCloudflareChallengePage } from './detection'
import type { PageLoader } from '~/site-spec/types'

export class PageEvaluator {
  constructor(
    private document: Document,
    private readonly pageLoaders: PageLoader[],
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

    for (const loader of this.pageLoaders) {
      if (loader.hostname && url.hostname !== loader.hostname) {
        continue
      }
      if (loader.matchesUrl(url.pathname)) {
        return { kind: 'match', loader }
      }
    }

    return { kind: 'fail', reason: 'no-matching-rule' }
  }
}

export type PageCheckResult = MatchingPageLoader | NoMatchFailure

export type MatchingPageLoader = {
  kind: 'match'
  loader: PageLoader
}

export type NoMatchFailure =
  | { kind: 'fail'; reason: 'no-matching-rule' }
  | { kind: 'fail'; reason: 'not-found' }
  | { kind: 'fail'; reason: 'well-known-response'; response: 'cloudflare' }
