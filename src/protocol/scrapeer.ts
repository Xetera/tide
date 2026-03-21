export interface PageSpec {
  /** An opaque identifier unique for the backend that defines it */
  $id: string
  /** A fixed url for which sites should be matched */
  $hostname: string
  /**
   * An object that determines things about the resource being scraped.
   * Keys are output field names, values are field descriptors.
   * Currently only `locale` is used to influence number parsing.
   */
  $meta?: Record<string, NodeFieldDescriptor>
  /** Whether this resource should be ignored by the client */
  $disabled?: boolean
  /** Variables defined in the url or query expected to be parsed by the client */
  $variables?: Record<string, VariableDefinition>
  /** A regex compatible pattern for triggering scrapes */
  $urlPattern: string | string[]
  /**
   * CSS Selector to wait for before trying to run descriptors.
   * Works like puppeteer's `page.waitForSelector()`
   */
  $waitFor?: string[]
  /**
   * opaque string for the resource that should be sent with a
   * `If-Match` header when submitting jobs
   */
  $hash: string
  /** Field descriptors keyed by output field name */
  $fields: Record<string, FieldDescriptor>
}

export type FieldDescriptor =
  | NodeFieldDescriptor
  | ArrayFieldDescriptor
  | LiteralFieldDescriptor
  | VariantDescriptor[]

export interface NodeFieldDescriptor {
  $selector?: string
  $extractor?: ExtractorDescriptor
  $ifMissing?: IfMissing
  $fields?: Record<string, FieldDescriptor>
}

export interface ArrayFieldDescriptor {
  $selectorEach: string
  $id?: string
  $ifMissing?: IfMissing
  $extractor?: ExtractorDescriptor
  $fields?: Record<string, FieldDescriptor>
}

export interface LiteralFieldDescriptor {
  $literal: unknown
}

export interface VariantDescriptor {
  $match?: { $css: string }
  $selector?: string
  $selectorEach?: string
  $literal?: unknown
  $extractor?: ExtractorDescriptor
  $ifMissing?: IfMissing
  $fields?: Record<string, FieldDescriptor>
}

export type ExtractorDescriptor =
  | TextExtractorDescriptor
  | AttributeExtractorDescriptor
  | MediaExtractorDescriptor
  | ExistsExtractorDescriptor

export interface TextExtractorDescriptor {
  $extractor: 'text'
  $transformers?: TransformerDescriptor[]
}

export interface AttributeExtractorDescriptor {
  $extractor: 'attribute'
  $attribute: string
  $transformers?: TransformerDescriptor[]
}

export interface MediaExtractorDescriptor {
  $extractor: 'media'
  $transformers?: TransformerDescriptor[]
}

export interface ExistsExtractorDescriptor {
  $extractor: 'exists'
}

export type TransformerDescriptor =
  | RegexTransformerDescriptor
  | CastTransformerDescriptor
  | FallbackTransformerDescriptor
  | TrimTransformerDescriptor
  | LowercaseTransformerDescriptor
  | ExpandSuffixTransformerDescriptor

export interface RegexTransformerDescriptor {
  $transformer: 'regex'
  $regex: string
  $group?: number
  $replacement?: string | null
}

export type CastTransformerDescriptor =
  | { $transformer: 'cast'; $cast: 'url' }
  | {
      $transformer: 'cast'
      $cast: 'number'
      $options?: { $forceLocale?: string }
    }
  | { $transformer: 'cast'; $cast: 'date' }

export interface FallbackTransformerDescriptor {
  $transformer: 'fallback'
  $value: unknown
}

export interface TrimTransformerDescriptor {
  $transformer: 'trim'
  $options: ('inside' | 'outside')[]
}

export interface LowercaseTransformerDescriptor {
  $transformer: 'lowercase'
}

export interface ExpandSuffixTransformerDescriptor {
  $transformer: 'expand-suffix'
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
  resource_id: string
  payload: UnknownPayload
  variables: UnknownPayload
  warnings: readonly string[]
}

interface JobFail {
  success: false
  source: JobSource
  resource_id: string
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
  /** Cannot process jobs at all. Only sends matches */
  Passive = 'passive',
  /** Can process jobs by appending iframes */
  Active = 'active',
}
