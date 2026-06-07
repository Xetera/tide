import type { JobParameters, SiteSpec, ServerAutonomy } from '@tide/spec'

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
    this.url = url
  }
}
