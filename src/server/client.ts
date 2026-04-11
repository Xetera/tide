import dayjs from 'dayjs'
import { onMessage, sendMessage } from 'webext-bridge/background'
import { log, updateScrapeLogStatus } from '~/background/backend-logger'
import type { ContentScriptTracker } from '~/background/content-script-tracker'
import { Job } from './job'
import { JobQueue } from './job-queue'
import type {
  RawEntityPatch,
  JobParameters,
  JobPollParameters,
  JobPollResponse,
  JobResult,
  JobSource,
  PageSpec,
  ResourcesResponse,
} from '~/site-spec/types'
import { ServerAutonomy } from '~/site-spec/types'

const PRECONDITION_FAILED = 412

function isResolvedMediaField(value: unknown): value is { hash: string } {
  if (value === null || typeof value !== 'object') return false
  const v = value as Record<string, unknown>
  return typeof v.hash === 'string' && 'source_url' in v && 'content_type' in v
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(',')}]`
  }
  // CDN urls can change, make sure we're only comparing image hashes
  if (isResolvedMediaField(value)) {
    return JSON.stringify(value.hash)
  }
  if (value !== null && typeof value === 'object') {
    const sorted = Object.keys(value as object)
      .sort()
      .map(
        (k) =>
          `${JSON.stringify(k)}:${stableStringify((value as Record<string, unknown>)[k])}`,
      )
    return `{${sorted.join(',')}}`
  }
  return JSON.stringify(value)
}

export class Client {
  readonly servers: ServerDefinition[]
  readonly #cst: ContentScriptTracker
  readonly #onResourcesUpdated: (
    server: ServerDefinition,
    resources: PageSpec[],
  ) => void

  // TODO: turn this mess into an array of stateful classes
  #timers = new WeakMap<ServerDefinition, NodeJS.Timeout>()
  #rescheduleTimers = new WeakMap<ServerDefinition, NodeJS.Timeout>()
  #resources = new Map<ServerDefinition, PageSpec[]>()
  #lastResourceRequest = new Map<ServerDefinition, Date>()
  #recentSubmissions = new Map<
    string,
    { hash: string; sentAt: number; serialized: string }
  >()

  readonly #pollIntervalSeconds: number
  readonly #queue: JobQueue<JobParameters>
  #errorCount = 0
  enabledResources: (server: ServerDefinition) => Promise<string[]>

  constructor({
    pollIntervalSeconds,
    queueIntervalSeconds,
    cst,
    defaultServers = [],
    enabledResources,
    onResourcesUpdated,
    onPatches,
  }: ScrapeerClientOptions) {
    this.#pollIntervalSeconds = pollIntervalSeconds
    // We're assuming that there is only one server and that this isn't empty
    this.servers = defaultServers
    this.#cst = cst
    this.#onResourcesUpdated = onResourcesUpdated
    this.#queue = new JobQueue<JobParameters>({
      minimumWaitSeconds: queueIntervalSeconds,
      // TODO: make this work with multiple servers
      // biome-ignore lint/style/noNonNullAssertion: TODO
      run: (job) => this.#tryRequestActiveJob(job, this.servers[0]!),
    })

    onMessage('entity-patches', ({ data }) => {
      onPatches?.(data)
      this.#submitJob(
        data.patches,
        data.source,
        data.warnings,
        0,
        undefined,
        data.loader,
      )
    })
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
    this.#onResourcesUpdated(server, resources)
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
        return
      }
      const job = new Job(params, resource, server.autonomy)
      const tabId = await this.#cst.getScriptTab(resource)
      log({
        text: `Running job: ${resource.$entity}`,
        severity: 'debug',
        data: { url: job.url.toString(), resourceId: resource.$entity, tabId },
      })
      try {
        await sendMessage('run-job', job.params, {
          context: 'content-script',
          tabId,
        })
      } catch (err) {
        if (err instanceof Error) {
          log({
            severity: 'error',
            text: 'Something went wrong while trying to run job',
            data: { message: err.message, tabId },
          })
        }
      }
    } catch (err) {
      setTimeout(() => {
        this.#updateResource(server)
      })
      console.error(err)
    }
  }

  async #submitJob(
    patches: RawEntityPatch[],
    source: JobSource,
    warnings: string[],
    retryCount = 0,
    existingScrapeLogId?: string,
    loader?: { name: string; file: string },
  ) {
    const server = this.servers[0]
    if (!server) {
      return
    }
    console.log(
      `[spatula] scraped${loader ? ` ${loader.name}/${loader.file}` : ''}`,
      patches,
    )
    const scrapeLogId =
      existingScrapeLogId ??
      log({
        type: 'scrape',
        severity: 'info',
        patches,
        warnings,
        source: loader ? { kind: 'network', loader: loader.name, file: loader.file } : { kind: 'html' },
      })
    const body: JobResult = {
      success: true,
      patches,
      job: source,
      warnings,
    }
    const serialized = stableStringify(body)
    const payloadHash = await this.#hashString(serialized)
    const dedupKey = payloadHash
    const prior = this.#recentSubmissions.get(dedupKey)
    if (prior) {
      const withinWindow = Date.now() - prior.sentAt < 60_000
      if (withinWindow) {
        log({
          severity: 'info',
          text: 'Skipping duplicate submission',
        })
        return
      }
    }

    const jobPostReq = this.#requestJobPost(server.url, server.poolId, '', body)
    const request = await this.#requestBase(jobPostReq, server)
    let response: Response
    try {
      response = await fetch(request)
    } catch (err) {
      updateScrapeLogStatus(scrapeLogId, 'failed')
      log({
        severity: 'error',
        text: 'Failed to reach server',
        data: { error: err instanceof Error ? err.message : String(err) },
      })
      return
    }
    if (response.status === PRECONDITION_FAILED) {
      if (retryCount < 3) {
        log({
          severity: 'warning',
          text: 'Failed job precondition while submitting. Trying to refresh and re-submit...',
        })
      } else {
        updateScrapeLogStatus(scrapeLogId, 'failed')
        log({
          severity: 'error',
          text: 'Failed job precondition more than 3 times while submitting! Giving up and pausing temporarily',
          data: { retries: retryCount },
        })
        this.#stopPollingAndReschedule(server)
        return
      }

      this.stop(server)
      try {
        await this.#updateResource(server)
        await this.#submitJob(
          patches,
          source,
          warnings,
          retryCount + 1,
          scrapeLogId,
          loader,
        )
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
        responseText = responseText.slice(0, 1000).replace(/.{3}$/, '...')
      }
      updateScrapeLogStatus(scrapeLogId, 'failed', {
        httpStatus: response.status,
        serverResponse: responseText,
      })
      log({
        severity: 'error',
        text: 'Failed to submit job',
        data: { response: responseText },
      })
      return
    }

    const responseText = await response.text()
    this.#recentSubmissions.set(dedupKey, {
      hash: payloadHash,
      sentAt: Date.now(),
      serialized,
    })
    updateScrapeLogStatus(scrapeLogId, 'submitted', {
      httpStatus: response.status,
      serverResponse: responseText,
    })
  }

  async #updateResource(server: ServerDefinition): Promise<void> {
    try {
      if (!server.url.trim()) return

      const lastRequest = this.#lastResourceRequest.get(server)
      if (
        lastRequest &&
        dayjs(lastRequest).subtract(5, 'minutes').isAfter(new Date())
      ) {
        return
      }

      const request = await this.#requestBase(
        this.#requestResources(server.url, server.poolId),
        server,
      )

      const response = await fetch(request)
      const body: ResourcesResponse = await response.json()
      this.#resources.set(server, body.resources)
      this.#onResourcesUpdated(server, body.resources)
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

  async #requestBase(
    request: Request,
    server: ServerDefinition,
  ): Promise<Request> {
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
    return new Request(new URL(`/api/pool/${poolId}/resources`, base), {
      method: 'GET',
    })
  }

  #requestJobs(base: string, poolId: string, options: JobPollParameters) {
    const url = new URL(`/api/pool/${poolId}/worker/jobs`, base)
    url.searchParams.set('autonomy', options.autonomy)
    for (const id of options.resourceIds) {
      url.searchParams.append('resource[]', id)
    }
    return new Request(url, { method: 'GET' })
  }

  #requestJobPost(
    base: string,
    poolId: string,
    resourceHash: string,
    data: JobResult,
  ) {
    return new Request(new URL(`/api/pool/${poolId}/worker/jobs`, base), {
      method: 'POST',
      body: JSON.stringify(data),
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

  async #hashString(input: string): Promise<string> {
    const data = new TextEncoder().encode(input)
    const buf = await crypto.subtle.digest('SHA-256', data)
    return Array.from(new Uint8Array(buf))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('')
  }

  #findResource(id: string): { server: ServerDefinition; resource: PageSpec } {
    for (const server of this.servers) {
      const resources = this.#resources.get(server) ?? []
      for (const resource of resources) {
        if (resource.$entity === id) {
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
  cst: ContentScriptTracker
  enabledResources(server: ServerDefinition): Promise<string[]>
  onResourcesUpdated(server: ServerDefinition, resources: PageSpec[]): void
  onPatches?: (emission: {
    patches: RawEntityPatch[]
    source: JobSource
    warnings: string[]
  }) => void
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
