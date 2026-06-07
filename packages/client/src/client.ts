import dayjs from 'dayjs'
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
} from '@tide/spec'
import { ServerAutonomy } from '@tide/spec'
import type { ScrapeResult } from '@tide/spec'
import type {
  PollResponse,
  SyncSitesRequest,
  SyncSitesResponse,
  WorkerSitesResponse,
} from './api'

export interface SubmissionMeta {
  httpStatus?: number
  serverResponse?: string
}

export type SubmissionEvent =
  | { phase: 'start'; submissionId: string; events: SubmitEvent[]; warnings: string[]; tabId?: number }
  | { phase: 'submitted'; submissionId: string; tabId?: number; meta?: SubmissionMeta }
  | { phase: 'failed'; submissionId: string; tabId?: number; meta?: SubmissionMeta }
  | { phase: 'skipped-duplicate'; submissionId: string; tabId?: number }

export type DiagnosticEvent =
  | { kind: 'heartbeat-skipped'; reason: 'unconfigured' | 'invalid-url'; error?: string }
  | { kind: 'heartbeat-unreachable'; error: string }
  | { kind: 'server-undefined-on-update' }
  | { kind: 'sites-sync-failed'; error: string }
  | { kind: 'job-run-start'; siteId: string; url: string; tabId: number }
  | { kind: 'job-run-failed'; tabId: number; error: string }
  | { kind: 'sites-refetch-requested' }
  | { kind: 'poll-failed'; server: ServerDefinition; error: string }
  | { kind: 'submit-unreachable'; error: string }
  | { kind: 'precondition-giving-up'; retries: number }
  | { kind: 'precondition-retrying' }
  | { kind: 'precondition-reschedule-failed'; error: string }
  | { kind: 'submit-rejected'; response: string }
  | { kind: 'site-not-found'; siteId: string }

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
  readonly #getJobTab: () => Promise<number>
  readonly #runJob: (
    params: JobParameters,
    opts: { tabId: number },
  ) => Promise<void>
  readonly #onSubmission?: (event: SubmissionEvent) => void
  readonly #onDiagnostic?: (event: DiagnosticEvent) => void
  readonly #notifySubmitError?: (tabId?: number) => void
  readonly #notifySubmitSuccess?: (tabId?: number) => void
  readonly #onSitesUpdated?: (
    server: ServerDefinition,
    sites: SiteSpec[],
  ) => void
  readonly #onPatches?: (result: ScrapeResult) => void

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
    getJobTab,
    runJob,
    onSubmission,
    onDiagnostic,
    onSubmitError,
    onSubmitSuccess,
    defaultServers = [],
    onSitesUpdated,
    onPatches,
  }: ShoalClientOptions) {
    this.#pollIntervalSeconds = pollIntervalSeconds
    // We're assuming that there is only one server and that this isn't empty
    this.servers = defaultServers
    this.#getJobTab = getJobTab
    this.#runJob = runJob
    this.#onSubmission = onSubmission
    this.#onDiagnostic = onDiagnostic
    this.#notifySubmitError = onSubmitError
    this.#notifySubmitSuccess = onSubmitSuccess
    this.#onSitesUpdated = onSitesUpdated
    this.#onPatches = onPatches
    this.#queue = new JobQueue<JobParameters>({
      minimumWaitSeconds: queueIntervalSeconds,
      // TODO: make this work with multiple servers
      // biome-ignore lint/style/noNonNullAssertion: TODO
      run: (job) => this.#tryRequestActiveJob(job, this.servers[0]!),
    })
  }

  ingestPatch(result: ScrapeResult, tabId?: number): void {
    this.#onPatches?.(result)
    this.#queueEvent(result, tabId)
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
      this.#onDiagnostic?.({
        kind: 'heartbeat-skipped',
        reason: 'unconfigured',
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
      const error = err instanceof Error ? err.message : String(err)
      this.#onDiagnostic?.({
        kind: 'heartbeat-skipped',
        reason: 'invalid-url',
        error,
      })
      return { status: 'unreachable', error }
    }
    let res: Response
    try {
      const request = await this.#requestBase(
        new Request(url, { method: 'GET' }),
        server,
      )
      res = await fetch(request, { signal: AbortSignal.timeout(5000) })
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      this.#onDiagnostic?.({ kind: 'heartbeat-unreachable', error: message })
      return { status: 'unreachable', error: message }
    }
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
      this.#onDiagnostic?.({ kind: 'server-undefined-on-update' })
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
      this.#onDiagnostic?.({
        kind: 'sites-sync-failed',
        error: err instanceof Error ? err.message : String(err),
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
      const tabId = await this.#getJobTab()
      this.#onDiagnostic?.({
        kind: 'job-run-start',
        siteId: site.site,
        url: job.url.toString(),
        tabId,
      })
      try {
        await this.#runJob(job.params, { tabId })
      } catch (err) {
        if (err instanceof Error) {
          this.#onDiagnostic?.({
            kind: 'job-run-failed',
            tabId,
            error: err.message,
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
    const submissionId = crypto.randomUUID()
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
      this.#onSubmission?.({ phase: 'skipped-duplicate', submissionId, tabId })
      return
    }

    this.#onSubmission?.({
      phase: 'start',
      submissionId,
      events,
      warnings,
      tabId,
    })

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
      this.#onSubmission?.({
        phase: 'submitted',
        submissionId,
        tabId,
        meta: meta ?? undefined,
      })
    } catch (err) {
      const meta =
        err !== null && typeof err === 'object' && 'httpStatus' in err
          ? (err as SubmissionMeta)
          : undefined
      this.#onSubmission?.({ phase: 'failed', submissionId, tabId, meta })
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
      this.#onDiagnostic?.({
        kind: 'submit-unreachable',
        error: err instanceof Error ? err.message : String(err),
      })
      this.#notifySubmitError?.(tabId)
      throw err
    }
    if (response.status === PRECONDITION_FAILED) {
      if (retryCount >= 3) {
        this.#onDiagnostic?.({
          kind: 'precondition-giving-up',
          retries: retryCount,
        })
        this.#stopPollingAndReschedule(server)
        throw new Error('precondition failed too many times')
      }
      this.#onDiagnostic?.({ kind: 'precondition-retrying' })
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
        this.#onDiagnostic?.({
          kind: 'precondition-reschedule-failed',
          error: message,
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
      this.#onDiagnostic?.({ kind: 'submit-rejected', response: truncated })
      this.#notifySubmitError?.(tabId)
      throw Object.assign(new Error('job submission failed'), {
        httpStatus: response.status,
        serverResponse: truncated,
      })
    }
    this.#notifySubmitSuccess?.(tabId)
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
        this.#onDiagnostic?.({ kind: 'sites-refetch-requested' })
        await this.#updateSites(server)
      }

      this.#addJobs(body.jobs)
    } catch (error) {
      this.#onDiagnostic?.({
        kind: 'poll-failed',
        server,
        error: error instanceof Error ? error.message : '[unknown error]',
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
    this.#onDiagnostic?.({ kind: 'site-not-found', siteId: id })
    throw new Error(`Invalid site ${id}`)
  }
}

export interface ShoalClientOptions {
  pollIntervalSeconds: number
  queueIntervalSeconds: number
  defaultServers?: ServerDefinition[]
  getJobTab(): Promise<number>
  runJob(params: JobParameters, opts: { tabId: number }): Promise<void>
  onSubmission?(event: SubmissionEvent): void
  onDiagnostic?(event: DiagnosticEvent): void
  onSubmitError?(tabId?: number): void
  onSubmitSuccess?(tabId?: number): void
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
