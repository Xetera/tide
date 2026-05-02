import { matchesGlob } from '~/extraction/glob'
import { parse } from '~/htmlevate/parser'

export interface RequestMatcher {
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'
  url: string
}

export interface HtmlEvatePage {
  $entity: string
  $urlPattern: string | string[]
  $hostname?: string
  source: string
}

export interface HtmlEvateLoader {
  name: string
  hostname: string
  urlPattern: string
  source: string
  path?: string
}

export class SiteDefinition {
  readonly hostname: string
  readonly dir: string
  readonly icon?: string
  readonly entities: Entity[]

  #pages: PageSpec[]
  #htmlevatePages: HtmlEvatePage[]
  #loaders: Record<string, LoaderExpression[]>
  #requests: Record<string, RequestMatcher>

  constructor(init: {
    hostname: string
    dir: string
    icon?: string
    entities: Entity[]
    pages: PageSpec[]
    htmlevatePages: HtmlEvatePage[]
    loaders: Record<string, LoaderExpression[]>
    requests: Record<string, RequestMatcher>
  }) {
    this.hostname = init.hostname
    this.dir = init.dir
    this.icon = init.icon
    this.entities = init.entities
    this.#pages = init.pages
    this.#htmlevatePages = init.htmlevatePages
    this.#loaders = init.loaders
    this.#requests = init.requests
  }

  getPages(): PageSpec[] {
    return this.#pages
  }

  getHtmlevatePages(): HtmlEvatePage[] {
    return this.#htmlevatePages
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

  getHtmlevateLoaders(): HtmlEvateLoader[] {
    const result: HtmlEvateLoader[] = []
    for (const [name, exprs] of Object.entries(this.#loaders)) {
      const matcher = this.#requests[name]
      if (!matcher) {
        continue
      }
      for (const expr of exprs) {
        if (expr.format !== 'htmlevate') {
          continue
        }
        result.push({
          name,
          hostname: this.hostname,
          urlPattern: matcher.url,
          source: expr.expression,
          path: `src/sites/${this.dir}/loaders/${expr.file}`,
        })
      }
    }
    return result
  }

  getJsonataLoaderFiles(): Array<{ name: string; path: string; format: 'jsonata' }> {
    const result: Array<{ name: string; path: string; format: 'jsonata' }> = []
    for (const [name, exprs] of Object.entries(this.#loaders)) {
      for (const expr of exprs) {
        if (expr.format === 'jsonata') {
          result.push({ name, path: `src/sites/${this.dir}/loaders/${expr.file}`, format: 'jsonata' })
        }
      }
    }
    return result
  }

  getLoaderRequest(loaderName: string): RequestMatcher | undefined {
    return this.#requests[loaderName]
  }

  hasLoader(loaderName: string): boolean {
    return loaderName in this.#loaders
  }

  getNetworkLoaders(): Array<{
    name: string
    url: string
    method: string
    expressions: LoaderExpression[]
  }> {
    const result: Array<{ name: string; url: string; method: string; expressions: LoaderExpression[] }> = []
    for (const [name, expressions] of Object.entries(this.#loaders)) {
      const matcher = this.#requests[name]
      if (!matcher) {
        continue
      }
      result.push({ name, url: matcher.url, method: matcher.method, expressions })
    }
    return result
  }

  patchSource(relPath: string, content: string): boolean {
    const pageMatch = relPath.match(/sites\/([^/]+)\/pages\/([^/]+)\/index\.htmlevate$/)
    if (pageMatch && pageMatch[1] === this.dir) {
      try {
        const { frontmatter } = parse(content)
        if (!frontmatter.entity || !frontmatter.urlPattern) {
          return false
        }
        const entity = String(frontmatter.entity)
        const updated: HtmlEvatePage = {
          $entity: entity,
          $urlPattern: frontmatter.urlPattern as string | string[],
          $hostname: this.hostname,
          source: content,
        }
        const idx = this.#htmlevatePages.findIndex((p) => p.$entity === entity)
        if (idx >= 0) {
          this.#htmlevatePages[idx] = updated
        } else {
          this.#htmlevatePages.push(updated)
        }
      } catch {
        return false
      }
      return true
    }

    const loaderMatch = relPath.match(/sites\/([^/]+)\/loaders\/(?:[^/]+\/)?(.+\.(jsonata|htmlevate))$/)
    if (loaderMatch && loaderMatch[1] === this.dir) {
      const file = loaderMatch[2]!
      for (const entries of Object.values(this.#loaders)) {
        for (const entry of entries) {
          if (entry.file === file) {
            entry.expression = content
            return true
          }
        }
      }
    }
    return false
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

export interface PageSpec {
  $hostname?: string
  $meta?: Record<string, NodeFieldDescriptor>
  $entity: string
  $disabled?: boolean
  $variables?: Record<string, VariableDefinition>
  $urlPattern: string | string[]
  $waitFor?: string[]
  $gone?: MatchExpression
  $fields: Record<string, FieldDescriptor>
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

export type FieldDescriptor =
  | NodeFieldDescriptor
  | ArrayFieldDescriptor
  | LiteralFieldDescriptor
  | VariantDescriptor[]

export type LoaderExpression =
  | { format: 'jsonata'; file: string; expression: string }
  | { format: 'htmlevate'; file: string; expression: string }

export type SourceDescriptor = { $css: string } | { $query: string }

export type SourceEachDescriptor = { $cssEach: string }

export type TransformStep =
  | { $text: true }
  | { $attr: string }
  | { $media: Partial<MediaOptions> }
  | { $exists: true }
  | { $regex: string; $group?: number; $replacement?: string | null }
  | { $cast: 'number' | 'url' | 'date'; $options?: { $forceLocale?: string } }
  | { $trim: ('inside' | 'outside')[] }
  | { $fallback: unknown }
  | { $lowercase: true }
  | { $expandSuffix: true }

export interface MediaOptions {
  $offload: true
  $urlExpires: true | string
  $urlSensitive: true
}

export interface NodeFieldDescriptor {
  $source?: SourceDescriptor
  $transform?: TransformStep[]
  $json?: string
  $entity?: string
  $ifMissing?: IfMissing
  $fields?: Record<string, FieldDescriptor>
}

export interface ArrayFieldDescriptor {
  $sourceEach: SourceEachDescriptor
  $entity?: string
  $ifMissing?: IfMissing
  $transform?: TransformStep[]
  $json?: string
  $fields?: Record<string, FieldDescriptor>
}

export interface LiteralFieldDescriptor {
  $literal: unknown
}

export type MatchExpression = { $css: string } | { $xpath: string }

export interface VariantDescriptor {
  $match?: MatchExpression
  $source?: SourceDescriptor
  $sourceEach?: SourceEachDescriptor
  $literal?: unknown
  $transform?: TransformStep[]
  $json?: string
  $ifMissing?: IfMissing
  $fields?: Record<string, FieldDescriptor>
}

export type IfMissing =
  | { $strategy: 'bail'; $warning?: string }
  | { $strategy: 'omit'; $warning?: string }
  | { $strategy: 'fallback'; $value: LiteralFieldDescriptor | FieldDescriptor }

export interface VariableDefinition {
  $kind: 'url' | 'query'
  $alias?: string
  $description: string
  $ifMissing?: { $strategy: 'fallback'; $value: LiteralFieldDescriptor }
}

export interface ResourcesResponse {
  name: string
  resources: PageSpec[]
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
