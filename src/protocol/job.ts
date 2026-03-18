import { constructPathRegexes } from './resource'
import type { JobParameters, Resource, ServerAutonomy } from './scrapeer'

export class Job {
  readonly url: URL
  constructor(
    readonly params: JobParameters,
    readonly resource: Resource,
    readonly autonomy: ServerAutonomy,
  ) {
    const url = new URL(params.url)
    if (url.hostname !== resource.$hostname) {
      throw new Error(
        `Invalid job hostname: ${url.hostname}. Expected ${resource.$hostname}`,
      )
    }
    const patterns = constructPathRegexes(resource.$urlPattern)

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
