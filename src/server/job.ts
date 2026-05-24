import { constructPathRegexes } from '~/site-spec/resource'
import type { JobParameters, SiteSpec, ServerAutonomy } from '~/site-spec/types'

export class Job {
  readonly url: URL
  constructor(
    readonly params: JobParameters,
    readonly site: SiteSpec,
    readonly autonomy: ServerAutonomy,
  ) {
    const url = new URL(params.url)
    if (url.hostname !== site.hostname) {
      throw new Error(
        `Invalid job hostname: ${url.hostname}. Expected ${site.hostname}`,
      )
    }
    const patterns = constructPathRegexes(site.url)

    if (!patterns.some((pattern) => pattern.test(url.pathname))) {
      throw new InvalidJobUrlError(url)
    }
    this.url = url
  }
}

export class InvalidJobUrlError extends Error {
  constructor(public readonly url: URL) {
    super(`Invalid job url: ${url.toString()}`)
  }
}
