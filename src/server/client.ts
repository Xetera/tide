import dayjs from 'dayjs'
import { onMessage, sendMessage } from 'webext-bridge/background'
import {
  log,
  pushScrapeLog,
  updateScrapeLogStatus,
} from '~/background/backend-logger'
import { scrapeSourceFunnelKey } from '~/shared/log'
import { flashError, flashSuccess } from '~/background/badge'
import type { ContentScriptTracker } from '~/background/content-script-tracker'
import { Job } from './job'
import { JobQueue } from './job-queue'
import type {
  JobParameters,
  JobPollParameters,
  JobPollResponse,
  JobResult,
  JobSource,
  SiteSpec,
  SubmitEvent,
} from '~/funnels/types'
import { ServerAutonomy } from '~/funnels/types'
import type { ScrapeResult } from '~/funnels/scrape-result'
import type {
  PollResponse,
  SyncSitesRequest,
  SyncSitesResponse,
  WorkerSitesResponse,
} from './api'

const PRECONDITION_FAILED = 412

interface PendingBatch {
  job: JobSource
  warnings: string[]
  events: SubmitEvent[]
  tabId?: number
}

interface SubmitJobOptions {
  job: JobSource
  events: SubmitEvent[]
  warnings: string[]
  tabId?: number
}

function isResolvedMediaField(value: unknown): value is { hash: string } {
  if (value === null || typeof value !== 'object') {
    return false
  }
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
  readonly #onSitesUpdated?: (
    server: ServerDefinition,
    sites: SiteSpec[],
  ) => void

  // TODO: turn this mess into an array of stateful classes
  #timers = new WeakMap<ServerDefinition, NodeJS.Timeout>()
  #rescheduleTimers = new WeakMap<ServerDefinition, NodeJS.Timeout>()
  #sites = new Map<ServerDefinition, SiteSpec[]>()
  #lastSitesRequest = new Map<ServerDefinition, Date>()
  #recentSubmissions = new Map<
    string,
    { hash: string; sentAt: number; serialized: string }
  >()
  #pendingBatches = new Map<string, PendingBatch>()

  readonly #pollIntervalSeconds: number
  readonly #queue: JobQueue<JobParameters>
  #errorCount = 0

  constructor({
    pollIntervalSeconds,
    queueIntervalSeconds,
    cst,
    defaultServers = [],
    onSitesUpdated,
    onPatches,
  }: ShoalClientOptions) {
    this.#pollIntervalSeconds = pollIntervalSeconds
    // We're assuming that there is only one server and that this isn't empty
    this.servers = defaultServers
    this.#cst = cst
    this.#onSitesUpdated = onSitesUpdated
    this.#queue = new JobQueue<JobParameters>({
      minimumWaitSeconds: queueIntervalSeconds,
      // TODO: make this work with multiple servers
      // biome-ignore lint/style/noNonNullAssertion: TODO
      run: (job) => this.#tryRequestActiveJob(job, this.servers[0]!),
    })

    onMessage('entity-patches', ({ data, sender }) => {
      onPatches?.(data)
      this.#queueEvent(data, sender.tabId)
    })
  }

  get allSites(): SiteSpec[] {
    return Array.from(this.#sites.values()).flat()
  }

  getServer(): ServerDefinition {
    // biome-ignore lint/style/noNonNullAssertion: We'll add multi server support soon enough
    return this.servers[0]!
  }

  async sendHeartbeat(): Promise<HeartbeatStatus> {
    const server = this.servers[0]
    if (!server?.url || !server.poolId || !server.workerSecret) {
      log({
        severity: 'debug',
        scope: 'pool',
        text: 'Heartbeat skipped: server not configured',
        data: {
          hasUrl: !!server?.url,
          hasPoolId: !!server?.poolId,
          hasWorkerSecret: !!server?.workerSecret,
        },
      })
      return { status: 'unconfigured' }
    }
    let url: URL
    try {
      url = new URL(
        `/api/pool/${server.poolId}/workers/me/heartbeat`,
        server.url,
      )
    } catch (err) {
      log({
        severity: 'error',
        scope: 'pool',
        text: 'Heartbeat failed: invalid server URL',
        data: {
          serverUrl: server.url,
          poolId: server.poolId,
          error: err instanceof Error ? err.message : String(err),
        },
      })
      return {
        status: 'unreachable',
        error: err instanceof Error ? err.message : String(err),
      }
    }
    log({
      severity: 'debug',
      scope: 'pool',
      text: 'Heartbeat: sending request',
      data: { url: url.toString(), workerId: server.workerId },
    })
    let res: Response
    const startedAt = Date.now()
    try {
      const request = await this.#requestBase(
        new Request(url, { method: 'GET' }),
        server,
      )
      res = await fetch(request, { signal: AbortSignal.timeout(5000) })
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      const name = err instanceof Error ? err.name : undefined
      log({
        severity: 'warning',
        scope: 'pool',
        text: 'Heartbeat: fetch threw before receiving a response',
        data: {
          url: url.toString(),
          error: message,
          errorName: name,
          elapsedMs: Date.now() - startedAt,
        },
      })
      return { status: 'unreachable', error: message }
    }
    log({
      severity: 'debug',
      scope: 'pool',
      text: 'Heartbeat: response received',
      data: {
        url: url.toString(),
        httpStatus: res.status,
        elapsedMs: Date.now() - startedAt,
      },
    })
    if (res.ok) {
      return { status: 'ok' }
    }
    if (res.status === 401 || res.status === 403) {
      return { status: 'unauthorized', httpStatus: res.status }
    }
    return { status: 'error', httpStatus: res.status }
  }

  async start(server: ServerDefinition) {
    try {
      await this.#updateSites(server)
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

  setSites(server: ServerDefinition, sites: SiteSpec[]) {
    this.#sites.set(server, sites)
    this.#onSitesUpdated?.(server, sites)
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
        scope: 'pool',
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

  async syncSites(optedIn: string[]): Promise<SyncSitesResponse | null> {
    const server = this.servers[0]
    if (!server?.url || !server.poolId || !server.workerSecret) {
      return null
    }
    try {
      const request = await this.#requestBase(
        new Request(new URL(`/api/pool/${server.poolId}/workers/me/sites`, server.url), {
          method: 'PUT',
          body: JSON.stringify({ opted_in: optedIn } satisfies SyncSitesRequest),
          headers: { 'Content-Type': 'application/json; charset=utf-8' },
        }),
        server,
      )
      const response = await fetch(request)
      if (!response.ok) {
        return null
      }
      return (await response.json()) as SyncSitesResponse
    } catch (err) {
      log({
        severity: 'error',
        scope: 'pool',
        text: 'Failed to sync opted-in sites',
        data: { error: err instanceof Error ? err.message : String(err) },
      })
      return null
    }
  }

  async #tryRequestActiveJob(params: JobParameters, server: ServerDefinition) {
    try {
      const { site } = this.#findSite(params.resource_id)
      if (server.autonomy === ServerAutonomy.Passive) {
        console.warn(
          `[client] ignoring job request from ${server.url} because the server is in passive mode`,
        )
        return
      }
      const job = new Job(params, site, server.autonomy)
      const tabId = await this.#cst.getScriptTab()
      log({
        text: `Running job: ${site.site}`,
        severity: 'debug',
        scope: 'pool',
        data: { url: job.url.toString(), siteId: site.site, tabId },
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
            scope: 'pool',
            text: 'Something went wrong while trying to run job',
            data: { message: err.message, tabId },
          })
        }
      }
    } catch (err) {
      setTimeout(() => {
        this.#updateSites(server)
      })
      console.error(err)
    }
  }

  #queueEvent(result: ScrapeResult, tabId?: number): void {
    if (!result.source || result.patches.length === 0) {
      return
    }
    const key = `${tabId ?? 'no-tab'}|${stableStringify(result.source)}`
    let batch = this.#pendingBatches.get(key)
    if (!batch) {
      batch = {
        job: result.source,
        warnings: [],
        events: [],
        tabId,
      }
      this.#pendingBatches.set(key, batch)
      queueMicrotask(() => this.#flushBatch(key))
    }
    if (result.scrapeSource) {
      batch.events.push({
        funnel: result.scrapeSource,
        patches: result.patches,
      })
    }
    if (result.warnings.length > 0) {
      batch.warnings.push(...result.warnings)
    }
  }

  #flushBatch(key: string): void {
    const batch = this.#pendingBatches.get(key)
    if (!batch) {
      return
    }
    this.#pendingBatches.delete(key)
    if (batch.events.length === 0) {
      return
    }
    this.#submitJob({
      job: batch.job,
      events: batch.events,
      warnings: batch.warnings,
      tabId: batch.tabId,
    })
  }

  async #submitJob(opts: SubmitJobOptions): Promise<void> {
    const { job, events, warnings, tabId } = opts
    if (events.length === 0) {
      return
    }
    const server = this.servers[0]
    if (!server) {
      return
    }
    console.log(
      `[tide] scraped ${events
        .map((e) => scrapeSourceFunnelKey(e.funnel) ?? e.funnel.kind)
        .join(', ')}`,
      events,
    )
    const body: JobResult = {
      success: true,
      job,
      events,
      warnings,
    }
    const serialized = stableStringify(body)
    const payloadHash = await this.#hashString(serialized)
    const dedupKey = payloadHash
    const prior = this.#recentSubmissions.get(dedupKey)
    if (prior && Date.now() - prior.sentAt < 60_000) {
      log({
        severity: 'info',
        scope: 'pool',
        text: 'Skipping duplicate submission',
      })
      return
    }

    const scrapeLogIds = await Promise.all(
      events.map((event) =>
        pushScrapeLog({
          type: 'scrape',
          severity: 'info',
          patches: event.patches,
          warnings,
          source: event.funnel,
        }),
      ),
    )

    try {
      const meta = await this.#performSubmit({
        server,
        body,
        tabId,
        retryCount: 0,
      })
      this.#recentSubmissions.set(dedupKey, {
        hash: payloadHash,
        sentAt: Date.now(),
        serialized,
      })
      await Promise.all(
        scrapeLogIds.map((id) =>
          updateScrapeLogStatus(id, 'submitted', meta ?? undefined),
        ),
      )
    } catch (err) {
      const failureMeta =
        err !== null && typeof err === 'object' && 'httpStatus' in err
          ? (err as { httpStatus?: number; serverResponse?: string })
          : undefined
      await Promise.all(
        scrapeLogIds.map((id) =>
          updateScrapeLogStatus(id, 'failed', failureMeta),
        ),
      )
    }
  }

  async #performSubmit(args: {
    server: ServerDefinition
    body: JobResult
    tabId?: number
    retryCount: number
  }): Promise<{ httpStatus?: number; serverResponse?: string }> {
    const { server, body, tabId, retryCount } = args
    const jobPostReq = this.#requestJobPost(server.url, server.poolId, '', body)
    let response: Response
    try {
      const request = await this.#requestBase(jobPostReq, server)
      response = await fetch(request)
    } catch (err) {
      log({
        severity: 'error',
        scope: 'pool',
        text: 'Failed to reach server',
        data: { error: err instanceof Error ? err.message : String(err) },
      })
      flashError(tabId)
      throw err
    }
    if (response.status === PRECONDITION_FAILED) {
      if (retryCount >= 3) {
        log({
          severity: 'error',
          scope: 'pool',
          text: 'Failed job precondition more than 3 times while submitting! Giving up and pausing temporarily',
          data: { retries: retryCount },
        })
        this.#stopPollingAndReschedule(server)
        throw new Error('precondition failed too many times')
      }
      log({
        severity: 'warning',
        scope: 'pool',
        text: 'Failed job precondition while submitting. Trying to refresh and re-submit...',
      })
      this.stop(server)
      try {
        await this.#updateSites(server)
        return await this.#performSubmit({
          server,
          body,
          tabId,
          retryCount: retryCount + 1,
        })
      } catch (err) {
        const message =
          err instanceof Error ? err.message : '[non-Error thrown]'
        log({
          severity: 'error',
          scope: 'pool',
          text: 'Got an error while trying to reschedule a failed precondition',
          data: { error: message },
        })
        throw err
      } finally {
        this.start(server)
      }
    }
    const responseText = await response.text()
    if (response.status < 200 || response.status >= 300) {
      const truncated =
        responseText.length > 1000
          ? responseText.slice(0, 1000).replace(/.{3}$/, '...')
          : responseText
      log({
        severity: 'error',
        scope: 'pool',
        text: 'Failed to submit job',
        data: { response: truncated },
      })
      flashError(tabId)
      throw Object.assign(new Error('job submission failed'), {
        httpStatus: response.status,
        serverResponse: truncated,
      })
    }
    flashSuccess(tabId)
    return { httpStatus: response.status, serverResponse: responseText }
  }

  async #updateSites(server: ServerDefinition): Promise<void> {
    try {
      if (!server.url.trim()) {
        return
      }

      const lastRequest = this.#lastSitesRequest.get(server)
      if (
        lastRequest &&
        dayjs(lastRequest).subtract(5, 'minutes').isAfter(new Date())
      ) {
        return
      }

      const request = await this.#requestBase(
        this.#requestSites(server.url, server.poolId),
        server,
      )

      const response = await fetch(request)
      const wire = (await response.json()) as WorkerSitesResponse
      // Server returns site IDs only; the in-memory cache holds SiteSpec
      // objects assembled elsewhere. Coerce here until the server returns specs.
      const sites = wire.sites as unknown as SiteSpec[]
      this.#sites.set(server, sites)
      this.#onSitesUpdated?.(server, sites)
      this.#lastSitesRequest.set(server, new Date())
    } catch (error) {
      console.error('Error updating sites:', error)
      // no `finally` please
      this.#lastSitesRequest.set(server, new Date())
    }
  }

  async #pollForJobs(server: ServerDefinition) {
    const url = server.url.trim()
    if (!url) {
      return
    }
    try {
      const request = await this.#requestBase(
        this.#requestJobs(url, server.poolId, { autonomy: server.autonomy }),
        server,
      )
      const response = await fetch(request)

      const wire = (await response.json()) as PollResponse
      // Wire JobItem ({id, url, issued_at}) is narrower than the local
      // JobParameters shape consumers expect. Coerce until server is extended.
      const body = wire as unknown as JobPollResponse

      if (body.refetch?.includes('sites')) {
        log({
          severity: 'info',
          scope: 'pool',
          text: 'The server requested a refetch because the sites have changed',
        })
        await this.#updateSites(server)
      }

      this.#addJobs(body.jobs)
    } catch (error) {
      log({
        severity: 'error',
        scope: 'pool',
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

  #requestSites(base: string, poolId: string) {
    return new Request(new URL(`/api/pool/${poolId}/workers/me/sites`, base), {
      method: 'GET',
    })
  }

  #requestJobs(base: string, poolId: string, options: JobPollParameters) {
    const url = new URL(`/api/pool/${poolId}/workers/me/jobs`, base)
    url.searchParams.set('autonomy', options.autonomy)
    return new Request(url, { method: 'GET' })
  }

  #requestJobPost(
    base: string,
    poolId: string,
    resourceHash: string,
    data: JobResult,
  ) {
    return new Request(new URL(`/api/pool/${poolId}/workers/me/jobs`, base), {
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

  #findSite(id: string): {
    server: ServerDefinition
    site: SiteSpec
  } {
    for (const server of this.servers) {
      const sites = this.#sites.get(server) ?? []
      for (const site of sites) {
        if (site.site === id) {
          return { server, site }
        }
      }
    }
    log({
      severity: 'error',
      scope: 'pool',
      text: `Could not find site ${id}`,
    })
    throw new Error(`Invalid site ${id}`)
  }
}

export interface ShoalClientOptions {
  pollIntervalSeconds: number
  queueIntervalSeconds: number
  defaultServers?: ServerDefinition[]
  cst: ContentScriptTracker
  onSitesUpdated?(server: ServerDefinition, sites: SiteSpec[]): void
  onPatches?: (result: ScrapeResult) => void
}

export type HeartbeatStatus =
  | { status: 'ok' }
  | { status: 'unauthorized'; httpStatus: number }
  | { status: 'unreachable'; error: string }
  | { status: 'unconfigured' }
  | { status: 'error'; httpStatus: number }

export interface ServerDefinition {
  id: string
  name: string
  url: string
  poolId: string
  workerId: string
  workerSecret: string
  autonomy: ServerAutonomy
}
