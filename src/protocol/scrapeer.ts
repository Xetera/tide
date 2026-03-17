export interface Resource {
  /** An opaque identifier unique for the backend that defines it */
  id: string
  /** A fixed url for which sites should be matched */
  hostname: string
  /**
   * An object that determines things about the resource being scraped
   *
   * Currently only supports `locale` to influence how numbers behave with `transformer:cast`.
   * It expects a selector that evaluates to the locale of the page
   * @example
   * meta = { locale: "en" }
   * "1,201" -> 1200
   *
   * meta = { locale: "tr" }
   * "1,200" -> 1.2
   */
  meta: NodeSelector[]
  /** Whether this resource should be ignored by the client */
  disabled?: boolean
  /**
   * Variables defined in the url or query expected to be parsed by the client
   **/
  variables: VariableDefinition[]
  /** A regex compatible pattern for triggering scrapes */
  url_pattern: string
  /**
   * CSS Selector to wait for before trying to run descriptors.
   *
   * Works like puppeteer's `page.waitForSelector()`
   **/
  wait_for?: string[]
  /** Selectors that define the data that should be returned from a matching page */
  descriptors: Selector[]
  /**
   * opaque string for the resource that should be sent with a
   * `If-Match` header when submitting jobs
   */
  hash: string
}

export type Selector = NodeSelector | SelfSelector | ArraySelector

// export interface ComputedKey {
//   kind: 'computed'
//   selector: string
//   extractors: Extractor[]
// }

// export interface LiteralKey {
//   kind: 'literal'
//   selector: string
//   extractors: Extractor[]
// }

// export type Key = ComputedKey | LiteralKey

export interface NodeSelector {
  extractors: Extractor[]
  kind: 'selector:node'
  selector: string
  if_missing?: Recovery
}

export interface SelfSelector {
  extractors: Extractor[]
  kind: 'selector:self'
  if_missing?: Recovery
}

export interface ArraySelector {
  key: string
  fields: Selector[]
  kind: 'selector:array'
  selector: string
  if_missing?: Recovery
}

export type Extractor = TextExtractor | AttributeExtractor | StyleExtractor

export interface TextExtractor {
  key: string
  kind: 'extractor:text'
  transformers: Transformer[]
}

export interface AttributeExtractor {
  kind: 'extractor:attribute'
  key: string
  transformers?: Transformer[]
  attribute: string
}

/**
 * Can be used for extracting pseudo-content like
 * @example
 * ```css
 * .arbitrary-class:before {
 *   content: "hello world";
 * }
 * ```
 * Using the following declaration
 * ```json
 * {
 *   "key": "name",
 *   "pseudo": ":before",
 *   "declaration": "content"
 * }
 * ```
 */
export interface StyleExtractor {
  kind: 'extractor:style'
  key: string
  pseudo?: string
  declaration: keyof CSSStyleDeclaration
  transformers: Transformer[]
}

export type Transformer =
  | RegexTransformer
  | CastTransformer
  | FallbackTransformer
  | TrimTransformer

export interface RegexTransformer {
  kind: 'transformer:regex'
  regex: string
  replacement?: string | null
}

export type CastTransformer =
  | {
      kind: 'transformer:cast'
      type: 'url'
    }
  | {
      kind: 'transformer:cast'
      type: 'number'
      options?: { force_locale?: string }
    }

export interface FallbackTransformer {
  kind: 'transformer:fallback'
  value: string
}

export interface TrimTransformer {
  kind: 'transformer:trim'
  options: ('inside' | 'outside')[]
}

export type Recovery =
  | { kind: 'recovery:bail'; warning?: string }
  | {
      kind: 'recovery:omit'
      warning?: string
    }
  | {
      kind: 'recovery:fallback'
      selector: Selector
    }

export interface VariableDefinition {
  kind: 'url' | 'query'
  alias?: string
  identifier: string
  description: string
  default?: string
}

export interface ResourcesResponse {
  name: string
  resources: Resource[]
}

export type JobSource = { kind: 'active'; id: string } | { kind: 'passive' }

interface JobOkay {
  success: true
  // was the request fired off automatically or did the user
  // navigate to the page
  job: JobSource
  resource_id: string
  // requestDate: Date
  // responseDate: Date
  payload: UnknownPayload
  variables: UnknownPayload
  warnings: readonly string[]
}

interface JobFail {
  success: false
  source: JobSource
  // the hash of the resource that was used to fulfill the job
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
