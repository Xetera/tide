import { matchesGlob } from '~/extraction/glob'
import { normalizePath } from '~/site-spec/resource'

export interface PageFunnelEntry {
  site: string
  funnel: string
  file: string
  path: string
  expression: string
  body: string
  frontmatter: Record<string, unknown>
}

export interface NetworkFunnelEntry {
  site: string
  funnel: string
  file: string
  path: string
  expression: string
  body: string
  frontmatter: Record<string, unknown>
}

export interface FixtureEntry {
  site: string
  funnel: string
  path: string
  name: string
  data: unknown
}

export interface RequestMatcher {
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'
  url: string | string[]
}

export interface Funnel {
  readonly name: string
  readonly file: string
  readonly path: string
  readonly format: 'htmlegy' | 'jsonata'
  readonly key: string
  readonly source: string
  matchesUrl(pathname: string): boolean
}

export class PageFunnel implements Funnel {
  readonly name: string
  readonly site: string
  readonly file: string
  readonly path: string
  readonly format = 'htmlegy' as const
  readonly key: string
  readonly url: string | string[]
  readonly hostname: string | undefined
  #entry: PageFunnelEntry

  constructor(init: {
    name: string
    site: string
    file: string
    path: string
    url: string | string[]
    hostname: string | undefined
    entry: PageFunnelEntry
  }) {
    this.name = init.name
    this.site = init.site
    this.file = init.file
    this.path = init.path
    this.url = init.url
    this.hostname = init.hostname
    this.#entry = init.entry
    this.key = `${init.name}/${init.file}`
  }

  get source(): string {
    return this.#entry.body
  }

  get label(): string | undefined {
    const v = this.#entry.frontmatter.name
    return typeof v === 'string' ? v : undefined
  }

  matchesUrl(pathname: string): boolean {
    const normalized = normalizePath(pathname)
    const patterns = Array.isArray(this.url) ? this.url : [this.url]
    return patterns.some((p) => matchesGlob(normalizePath(p), normalized))
  }
}

export class NetworkFunnel implements Funnel {
  readonly name: string
  readonly file: string
  readonly path: string
  readonly format = 'jsonata' as const
  readonly key: string
  #entry: NetworkFunnelEntry
  #request: RequestMatcher

  constructor(init: {
    name: string
    file: string
    path: string
    request: RequestMatcher
    entry: NetworkFunnelEntry
  }) {
    this.name = init.name
    this.file = init.file
    this.path = init.path
    this.#entry = init.entry
    this.#request = init.request
    this.key = `${init.name}/${init.file}`
  }

  get source(): string {
    return this.#entry.body
  }

  get label(): string | undefined {
    const v = this.#entry.frontmatter.name
    return typeof v === 'string' ? v : undefined
  }

  matchesUrl(pathname: string): boolean {
    const normalized = normalizePath(pathname)
    const urls = Array.isArray(this.#request.url)
      ? this.#request.url
      : [this.#request.url]
    return urls.some((u) => matchesGlob(normalizePath(u), normalized))
  }
}

export class NetworkFunnelGroup {
  readonly name: string
  readonly hostname: string
  readonly request: RequestMatcher
  readonly funnels: NetworkFunnel[]

  constructor(init: {
    name: string
    hostname: string
    request: RequestMatcher
    funnels: NetworkFunnel[]
  }) {
    this.name = init.name
    this.hostname = init.hostname
    this.request = init.request
    this.funnels = init.funnels
  }

  get key(): string {
    return this.funnels[0]?.key ?? this.name
  }
}

export class SiteDefinition {
  readonly hostname: string
  readonly id: string
  readonly icon?: string
  readonly entities: Entity[]
  readonly pageFunnels: PageFunnel[]
  readonly networkFunnels: NetworkFunnelGroup[]

  constructor(init: {
    hostname: string
    id: string
    icon?: string
    entities: Entity[]
    pageFunnels: PageFunnel[]
    networkFunnels: NetworkFunnelGroup[]
  }) {
    this.hostname = init.hostname
    this.id = init.id
    this.icon = init.icon
    this.entities = init.entities
    this.pageFunnels = init.pageFunnels
    this.networkFunnels = init.networkFunnels
  }

  getPageFunnels(): PageFunnel[] {
    return this.pageFunnels
  }

  matchesCapture(url: URL, method: string): boolean {
    const upperMethod = method.toUpperCase()
    for (const group of this.networkFunnels) {
      if (group.request.method.toUpperCase() !== upperMethod) {
        continue
      }
      const urls = Array.isArray(group.request.url)
        ? group.request.url
        : [group.request.url]
      if (urls.some((u) => matchesGlob(u, url.pathname))) {
        return true
      }
    }
    return false
  }

  getNetworkFunnels(): NetworkFunnelGroup[] {
    return this.networkFunnels
  }

  matchesHostname(url: URL): boolean {
    return url.hostname === this.hostname
  }
}

export interface Entity {
  entity: string
  version: number
  fields: import('typebox').TObject
  canonicalUrl?: string
  uniqueFields?: string[]
  displayField?: string
}

export type EntityId = string | string[]

export interface EntityRef {
  _type: 'ref'
  _id: EntityId
}

export interface RawEntityPatch {
  _entity: string
  _id: EntityId
  [key: string]: unknown
  // optional
  _createdAt?: string
}

declare const validatedBrand: unique symbol

export type EntityPatch = RawEntityPatch & { [validatedBrand]: true }

export type AssetReference = {
  mimeType?: string
  hash: string
  sourceUrl?: string
  seenAt: number
} & (
  | {
      type: 'pending'
    }
  | {
      type: 'ready'
      url: string
    }
)

export interface SiteSpec {
  site: string
  hostname: string
}

export interface ResourceSpec {
  entity: string
  hostname: string
  url: string | string[]
}

export interface ResourcesResponse {
  name: string
  resources: ResourceSpec[]
}

export type JobSource = { kind: 'active'; id: string } | { kind: 'passive' }

export interface SubmitEvent {
  funnel: import('~/shared/log').ScrapeSource
  patches: EntityPatch[]
}

interface JobOkay {
  success: true
  job: JobSource
  events: SubmitEvent[]
  warnings: readonly string[]
}

interface JobFail {
  success: false
  job: JobSource
  error: string
}

export type JobResult = JobOkay | JobFail

export interface JobParameters {
  id: string
  resource_id: string
  issued_at: Date
  url: string
  expires_at: Date
}

export type UnknownPayload = Record<string, unknown>

export interface JobPollParameters {
  autonomy: ServerAutonomy
  resourceIds: string[]
}

export interface JobPollResponse {
  refetch?: Array<'sites'>
  jobs: JobParameters[]
}

export enum ServerAutonomy {
  Passive = 'passive',
  Active = 'active',
}
