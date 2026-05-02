import { matchesGlob } from '~/extraction/glob'
import { normalizePath } from '~/site-spec/resource'
import type { LoaderEntry } from '~/site-spec/loader-entry'
import type { LoaderProvider } from '~/loaders'

export interface RequestMatcher {
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'
  url: string
}

export interface SiteLoader {
  readonly name: string
  readonly file: string
  readonly path: string
  readonly format: 'htmlevate' | 'jsonata'
  readonly key: string
}

export class PageLoader implements SiteLoader {
  readonly name: string
  readonly file: string
  readonly path: string
  readonly format = 'htmlevate' as const
  readonly key: string
  readonly urlPattern: string | string[]
  readonly hostname: string | undefined
  #entry: LoaderEntry

  constructor(init: { name: string; file: string; path: string; urlPattern: string | string[]; hostname: string | undefined; entry: LoaderEntry }) {
    this.name = init.name
    this.file = init.file
    this.path = init.path
    this.urlPattern = init.urlPattern
    this.hostname = init.hostname
    this.#entry = init.entry
    this.key = `${init.name}/${init.file}`
  }

  get source(): string {
    return this.#entry.expression
  }

  matchesUrl(pathname: string): boolean {
    const normalized = normalizePath(pathname)
    const patterns = Array.isArray(this.urlPattern) ? this.urlPattern : [this.urlPattern]
    return patterns.some((p) => matchesGlob(normalizePath(p), normalized))
  }
}

export class NetworkLoader implements SiteLoader {
  readonly name: string
  readonly file: string
  readonly path: string
  readonly format: 'htmlevate' | 'jsonata'
  readonly key: string
  readonly hostname: string
  readonly urlPattern: string
  readonly url: string
  readonly method: string
  readonly expressions: LoaderExpression[]
  readonly source: string

  constructor(init: {
    name: string
    file: string
    path: string
    format: 'htmlevate' | 'jsonata'
    hostname: string
    urlPattern: string
    url: string
    method: string
    expressions: LoaderExpression[]
    source: string
  }) {
    this.name = init.name
    this.file = init.file
    this.path = init.path
    this.format = init.format
    this.hostname = init.hostname
    this.urlPattern = init.urlPattern
    this.url = init.url
    this.method = init.method
    this.expressions = init.expressions
    this.source = init.source
    this.key = `${init.name}/${init.file}`
  }
}

export type Loader = PageLoader | NetworkLoader

export class SiteDefinition {
  readonly hostname: string
  readonly dir: string
  readonly icon?: string
  readonly entities: Entity[]

  #requests: Record<string, RequestMatcher>
  #provider: LoaderProvider

  constructor(init: {
    hostname: string
    dir: string
    icon?: string
    entities: Entity[]
    requests: Record<string, RequestMatcher>
    provider: LoaderProvider
  }) {
    this.hostname = init.hostname
    this.dir = init.dir
    this.icon = init.icon
    this.entities = init.entities
    this.#requests = init.requests
    this.#provider = init.provider
  }

  getPageLoaders(): PageLoader[] {
    return this.#provider.getPageLoadersForSite(this.dir, this.hostname)
  }

  matchesCapture(url: URL, method: string): boolean {
    const upperMethod = method.toUpperCase()
    for (const matcher of Object.values(this.#requests)) {
      if (matcher.method.toUpperCase() !== upperMethod) {
        continue
      }
      if (matchesGlob(matcher.url, url.pathname)) {
        return true
      }
    }
    return false
  }


  getLoaderRequest(loaderName: string): RequestMatcher | undefined {
    return this.#requests[loaderName]
  }

  hasLoader(loaderName: string): boolean {
    return this.#provider.getForSite(this.dir).some((e) => e.loader === loaderName)
  }

  getNetworkLoaders(): NetworkLoader[] {
    return this.#provider.buildNetworkLoaders(this.dir, this.hostname, this.#requests)
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
  _createdAt?: number
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

export type LoaderExpression =
  | { format: 'jsonata'; file: string; expression: string }
  | { format: 'htmlevate'; file: string; expression: string }

export interface ResourceSpec {
  entity: string
  hostname: string
  urlPattern: string | string[]
}

export interface ResourcesResponse {
  name: string
  resources: ResourceSpec[]
}

export type JobSource = { kind: 'active'; id: string } | { kind: 'passive' }

interface JobOkay {
  success: true
  job: JobSource
  patches: RawEntityPatch[]
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
  refetch?: Array<'resources'>
  jobs: JobParameters[]
}

export enum ServerAutonomy {
  Passive = 'passive',
  Active = 'active',
}
