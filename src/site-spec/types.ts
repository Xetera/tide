export interface RequestMatcher {
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'
  url: string
}

export interface SiteDefinition {
  hostname: string
  dir: string
  icon?: string
  entities: Entity[]
  /** Named request matchers — what network requests to capture, keyed by name */
  requests: Record<string, RequestMatcher>
  /** JSONata expressions keyed by loader name, auto-discovered from loaders/ directory */
  loaders: Record<string, { file: string; expression: string }[]>
  /** HTML page specs */
  pages: PageSpec[]
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

// export class Entity

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
