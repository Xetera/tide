import { constructPathRegexes } from '~/site-spec/resource'
import type { JobParameters, ResourceSpec, ServerAutonomy } from '~/site-spec/types'

export class Job {
  readonly url: URL
  constructor(
    readonly params: JobParameters,
    readonly resource: ResourceSpec,
    readonly autonomy: ServerAutonomy,
  ) {
    const url = new URL(params.url)
    if (url.hostname !== resource.hostname) {
      throw new Error(
        `Invalid job hostname: ${url.hostname}. Expected ${resource.hostname}`,
      )
    }
    const patterns = constructPathRegexes(resource.url)

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
