import dayjs from 'dayjs'
import type { TypedEmitter } from 'tiny-typed-emitter'
import { log } from '~/background/backend-logger'
import type { ScrapedPage } from '../content-scripts/page-manager'
import { Job } from './job'
import { JobQueue } from './job-queue'
import type {
  JobParameters,
  JobPollParameters,
  JobPollResponse,
  JobResult,
  PageSpec,
  ResourcesResponse,
} from './scrapeer'
import { ServerAutonomy } from './scrapeer'

const PRECONDITION_FAILED = 412

/**
 * Each ScrapeerClient is responsible for polling a single source.
 * Does not hook into any chrome APIs. It expects the events it emits to be
 * handled by a background page access to communicating with the outside world
 */
export class Client {
  readonly servers: ServerDefinition[]
  readonly #events: TypedEmitter<ClientEvents>

  // TODO: turn this mess into an array of stateful classes
  #timers = new WeakMap<ServerDefinition, NodeJS.Timeout>()
  #rescheduleTimers = new WeakMap<ServerDefinition, NodeJS.Timeout>()
  #resources = new Map<ServerDefinition, PageSpec[]>()
  #lastResourceRequest = new Map<ServerDefinition, Date>()

  readonly #pollIntervalSeconds: number
  readonly #queue: JobQueue<JobParameters>
  #errorCount = 0
  enabledResources: (server: ServerDefinition) => Promise<string[]>

  constructor({
    pollIntervalSeconds,
    queueIntervalSeconds,
    events,
    defaultServers = [],
    enabledResources,
  }: ScrapeerClientOptions) {
    this.#pollIntervalSeconds = pollIntervalSeconds
    // We're assuming that there is only one server and that this isn't empty
    this.servers = defaultServers
    this.#queue = new JobQueue<JobParameters>({
      minimumWaitSeconds: queueIntervalSeconds,
      // TODO: make this work with multiple servers
      // biome-ignore lint/style/noNonNullAssertion: TODO
      run: (job) => this.#tryRequestActiveJob(job, this.servers[0]!),
    })

    events.on('pageMatched', (page) => this.#submitJob(page))
    events.on('pageScraped', (page) => this.#submitJob(page))
    this.#events = events
    this.enabledResources = enabledResources
  }

  get allResources(): PageSpec[] {
    return Array.from(this.#resources.values()).flat()
  }

  getServer(): ServerDefinition {
    // biome-ignore lint/style/noNonNullAssertion: We'll add multi server support soon enough
    return this.servers[0]!
  }

  async start(server: ServerDefinition) {
    try {
      await this.#updateResource(server)
      this.#rescheduleTimers.delete(server)
      if (this.#pollIntervalSeconds > 0) {
        const timer = setInterval(() => {
          this.#poll()
        }, this.#pollIntervalSeconds * 1000)
        this.#timers.set(server, timer)
      }
      await this.#poll()
    } catch (err) {
      console.error(err)
    }
  }

  async startAll() {
    this.#queue.start()
    for (const server of this.servers) {
      await this.start(server)
    }
  }

  stop(server: ServerDefinition) {
    const timer = this.#timers.get(server)
    if (timer) {
      clearInterval(timer)
    }
    this.#timers.delete(server)

    const rescheduleTimer = this.#rescheduleTimers.get(server)
    if (rescheduleTimer) {
      clearInterval(rescheduleTimer)
    }

    this.#rescheduleTimers.delete(server)
  }

  setResources(server: ServerDefinition, resources: PageSpec[]) {
    this.#resources.set(server, resources)
    this.#events.emit('updatedResources', server, resources)
  }

  addServer(server: ServerDefinition) {
    this.servers.push(server)
  }

  updateServer(newServer: Partial<ServerDefinition>) {
    // TODO: support multiple servers
    const [server] = this.servers
    if (!server) {
      log({
        severity: 'error',
        text: 'Tried to update server URL but no server is defined',
        data: 'url' in newServer ? { url: newServer.url } : {},
      })
      return
    }
    Object.assign(server, newServer)
  }

  stopAll() {
    this.#queue.stop()
    for (const server of this.servers) {
      this.stop(server)
    }
  }
  async #tryRequestActiveJob(params: JobParameters, server: ServerDefinition) {
    try {
      const { resource } = this.#findResource(params.resource_id)
      if (server.autonomy === ServerAutonomy.Passive) {
        console.warn(
          `[client] ignoring job request from ${server.url} because the server is in passive mode`,
        )
        this.#events.emit('insufficientAutonomyForJob', server, resource)
        return
      }
      const job = new Job(params, resource, server.autonomy)
      this.#events.emit('runJob', job)
    } catch (err) {
      setTimeout(() => {
        this.#updateResource(server)
      })
      console.error(err)
    }
  }

  async #submitJob(page: ScrapedPage, retryCount = 0) {
    let server: ServerDefinition
    let resource: PageSpec
    try {
      ;({ server, resource } = this.#findResource(page.resourceId))
    } catch (err) {
      log({
        severity: 'error',
        text: `${err}`,
      })
      return
    }
    const mediaMetadata: Record<string, { mimeType: string; sha256hash: string; bytes: number }> = {}
    for (const [hash, result] of Object.entries(page.media)) {
      mediaMetadata[hash] = {
        mimeType: result.mimeType,
        sha256hash: result.sha256hash,
        bytes: result.bytes,
      }
    }
    log({
      type: 'scrape',
      severity: 'info',
      resourceId: page.resourceId,
      entity: resource.$entity,
      url: page.url,
      variables: page.variables,
      payload: page.payload,
      media: mediaMetadata,
      warnings: page.warnings,
    })
    const body = await this.#processMatchingPage(page)

    const jobPostReq = this.#requestJobPost(server.url, server.poolId, resource.$hash, body)
    const request = await this.#requestBase(jobPostReq, server)
    let response: Response
    try {
      response = await fetch(request)
    } catch (err) {
      log({
        severity: 'error',
        text: `Failed to reach server for resource: ${page.resourceId}`,
        data: { error: err instanceof Error ? err.message : String(err) },
      })
      return
    }
    if (response.status === PRECONDITION_FAILED) {
      if (retryCount < 3) {
        log({
          severity: 'warning',
          text: 'Failed job precondition while submitting. Trying to refresh and re-submit...',
          data: { resourceId: resource.$id, hash: resource.$hash },
        })
      } else {
        log({
          severity: 'error',
          text: 'Failed job precondition more than 3 times while submitting! Giving up and pausing temporarily',
          data: {
            resourceId: resource.$id,
            hash: resource.$hash,
            retries: retryCount,
          },
        })
        this.#stopPollingAndReschedule(server)
        return
      }

      this.stop(server)
      try {
        await this.#updateResource(server)
        await this.#submitJob(page, retryCount + 1)
      } catch (err) {
        if (err instanceof Error) {
          log({
            severity: 'error',
            text: 'Got an error while trying to reschedule a failed precondition',
            data: { error: err.message },
          })
        } else {
          log({
            severity: 'error',
            text: "Got a super weird error while trying to reschedule a failed precondition but it's not an instance of an Error object?",
            data: { error: err },
          })
        }
      } finally {
        this.start(server)
      }
      return
    }
    if (response.status < 200 || response.status >= 300) {
      let responseText = await response.text()
      // To prevent overwhelming the log storage
      if (responseText.length > 1000) {
        responseText = responseText.slice(0, 1000).replace(/.{3}$/, '.')
      }
      log({
        severity: 'error',
        text: `Failed to submit job for resource: ${resource.$id}`,
        data: { response: responseText },
      })
      return
    }

    const jobResponse = await response.json() as { assets?: { upload_required?: { hash: string; token: string }[] } }
    const uploadRequired = jobResponse.assets?.upload_required ?? []
    if (uploadRequired.length > 0) {
      await this.#uploadAssets(server, uploadRequired, page.media)
    }

    log({
      severity: 'info',
      text: `Successfully submitted (${page.source.kind}) job ${resource.$id}`,
    })
  }

  async #uploadAssets(
    server: ServerDefinition,
    uploadRequired: { hash: string; token: string }[],
    media: Record<string, import('~/content-scripts/download-media').MediaResult>,
  ): Promise<void> {
    const mediaByHash = Object.fromEntries(
      Object.entries(media).map(([_fnv1a, result]) => [result.sha256hash, result]),
    )
    await Promise.all(
      uploadRequired.map(async ({ hash, token }) => {
        const result = mediaByHash[hash]
        if (!result) {
          log({ severity: 'error', text: `Server requested upload for ${hash} but bytes are not available` })
          return
        }
        const url = new URL(`/api/pool/${server.poolId}/assets/${hash}`, server.url)
        url.searchParams.set('token', token)
        try {
          await fetch(url, { method: 'POST', body: result.buffer, headers: { 'Content-Type': result.mimeType } })
        } catch (err) {
          log({ severity: 'error', text: `Failed to upload asset ${hash}`, data: { error: err instanceof Error ? err.message : String(err) } })
        }
      }),
    )
  }

  async #processMatchingPage(page: ScrapedPage): Promise<JobResult> {
    return {
      success: true,
      payload: page.payload,
      resource_id: page.resourceId,
      variables: page.variables,
      job: page.source,
      warnings: page.warnings,
    }
  }

  async #updateResource(server: ServerDefinition): Promise<void> {
    try {
      if (!server.url.trim()) return

      const lastRequest = this.#lastResourceRequest.get(server)
      if (
        lastRequest &&
        dayjs(lastRequest).subtract(5, 'minutes').isAfter(new Date())
      ) {
        this.#events.emit('resourceRateLimit', server, lastRequest)
        return
      }

      const request = await this.#requestBase(
        this.#requestResources(server.url, server.poolId),
        server,
      )

      const response = await fetch(request)
      const body: ResourcesResponse = await response.json()
      this.#resources.set(server, body.resources)
      this.#events.emit('updatedResources', server, body.resources)
      this.#lastResourceRequest.set(server, new Date())
    } catch (error) {
      console.error('Error updating jobs:', error)
      // no `finally` please
      this.#lastResourceRequest.set(server, new Date())
    }
  }

  async #pollForJobs(server: ServerDefinition) {
    const url = server.url.trim()
    if (!url) {
      return
    }
    try {
      const resourceIds = await this.enabledResources(server)
      const request = await this.#requestBase(
        this.#requestJobs(url, server.poolId, {
          autonomy: server.autonomy,
          resourceIds,
        }),
        server,
      )
      const response = await fetch(request)

      const body: JobPollResponse = await response.json()

      this.#events.emit('polled', server, body.jobs)

      if (body.refetch?.includes('resources')) {
        log({
          severity: 'info',
          text: 'The server requested a refetch because the resources have changed',
        })
        await this.#updateResource(server)
      }

      this.#addJobs(body.jobs)
    } catch (error) {
      log({
        severity: 'error',
        text: `Error polling for new jobs: ${server.name} ${error}`,
        data: {
          server,
          message: error instanceof Error ? error.message : '[unknown error]',
        },
      })
      console.error('Error polling for jobs:', error)
      if (this.#errorCount % 3 === 0) {
        console.error('Too many errors. Pausing polling')
        this.#stopPollingAndReschedule(server)
      }
      this.#errorCount++
    }
  }

  async #poll() {
    for (const server of this.servers) {
      await this.#pollForJobs(server)
    }
  }

  #addJobs(jobs: JobParameters[]): void {
    for (const job of jobs) {
      this.#queue.addJob(job)
    }
  }

  async #requestBase(request: Request, server: ServerDefinition): Promise<Request> {
    const body = request.method === 'GET' ? '' : await request.clone().text()
    const encoder = new TextEncoder()
    const keyData = encoder.encode(server.workerSecret)
    const msgData = encoder.encode(body)
    const key = await crypto.subtle.importKey(
      'raw',
      keyData,
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign'],
    )
    const sig = await crypto.subtle.sign('HMAC', key, msgData)
    const hmac = Array.from(new Uint8Array(sig))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('')
    return new Request(request, {
      headers: {
        ...Object.fromEntries(request.headers.entries()),
        Authorization: `Worker ${server.workerId}:${hmac}`,
        'Idempotency-Key': Math.random().toString(36).substring(2),
        'Content-Type': 'application/json; charset=utf-8',
      },
    })
  }

  #requestResources(base: string, poolId: string) {
    return new Request(new URL(`/api/pool/${poolId}/resources`, base), { method: 'GET' })
  }

  #requestJobs(base: string, poolId: string, options: JobPollParameters) {
    const url = new URL(`/api/pool/${poolId}/worker/jobs`, base)
    url.searchParams.set('autonomy', options.autonomy)
    for (const id of options.resourceIds) {
      url.searchParams.append('resource[]', id)
    }
    return new Request(url, { method: 'GET' })
  }

  #requestJobPost(base: string, poolId: string, resourceHash: string, data: JobResult) {
    return new Request(new URL(`/api/pool/${poolId}/worker/jobs`, base), {
      method: 'POST',
      body: JSON.stringify({ ...data, entity_id: (data as any).resource_id }),
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'If-Match': resourceHash,
      },
    })
  }

  #stopPollingAndReschedule(server: ServerDefinition) {
    this.stop(server)
    const timer = setTimeout(
      () => {
        console.log('Restarting polling again')
        return this.start(server)
      },
      // TODO: use exponential backoff
      Math.min(this.#errorCount, 25) * 60 * 1000,
    )
    this.#rescheduleTimers.set(server, timer)
  }

  #findResource(id: string): { server: ServerDefinition; resource: PageSpec } {
    for (const server of this.servers) {
      const resources = this.#resources.get(server) ?? []
      for (const resource of resources) {
        if (resource.$id === id) {
          return { server, resource }
        }
      }
    }
    log({
      severity: 'error',
      text: `Could not find resource ${id}`,
    })
    throw new Error(`Invalid resource ${id}`)
  }
}

export interface ScrapeerClientOptions {
  pollIntervalSeconds: number
  queueIntervalSeconds: number
  defaultServers?: ServerDefinition[]
  events: TypedEmitter<ClientEvents>
  enabledResources(server: ServerDefinition): Promise<string[]>
}

export interface ServerDefinition {
  id: string
  name: string
  url: string
  poolId: string
  workerId: string
  workerSecret: string
  autonomy: ServerAutonomy
}

export interface ClientEvents {
  // to client
  pageMatched(page: ScrapedPage): void
  pageScraped(page: ScrapedPage): void
  // from client
  runJob(job: Job): void
  updatedResources(server: ServerDefinition, resources: PageSpec[]): void
  polled(server: ServerDefinition, parameters: JobParameters[]): void
  resourceRateLimit(server: ServerDefinition, lastRequest: Date): void
  insufficientAutonomyForJob(server: ServerDefinition, resource: PageSpec): void
}

export interface PopupEvents {
  // to popup
  jobRan(job: Job): void
}
