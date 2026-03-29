import type {
  ArrayFieldDescriptor,
  FieldDescriptor,
  NodeFieldDescriptor,
  PageSpec,
  UnknownPayload,
  VariantDescriptor,
} from './scrapeer'

export interface MediaRef {
  url: string
  hash: string
  offload?: boolean
  urlExpires?: true | string
}

export interface ResolvedMediaField {
  hash: string
  size: number
  content_type: string
  source_url: string
}

export interface DownloadedMedia {
  sha256hash: string
  mimeType: string
  bytes: number
  buffer: ArrayBuffer
}

function isVariantArray(value: FieldDescriptor): value is VariantDescriptor[] {
  return Array.isArray(value)
}

function isArrayField(value: FieldDescriptor): value is ArrayFieldDescriptor {
  return '$selectorEach' in value
}

function isMediaNodeField(
  value: FieldDescriptor,
): value is NodeFieldDescriptor & { $extractor: { $extractor: 'media' } } {
  return (
    '$extractor' in value &&
    typeof value.$extractor === 'object' &&
    value.$extractor.$extractor === 'media'
  )
}

function resolveMediaRef(
  ref: MediaRef,
  downloaded: Record<string, DownloadedMedia>,
): ResolvedMediaField | MediaRef {
  const result = downloaded[ref.hash]
  if (!result) return ref
  return {
    hash: result.sha256hash,
    size: result.bytes,
    content_type: result.mimeType,
    source_url: ref.url,
  }
}

function substituteValue(
  value: unknown,
  downloaded: Record<string, DownloadedMedia>,
): unknown {
  if (isMediaRef(value)) return resolveMediaRef(value, downloaded)
  if (Array.isArray(value))
    return value.map((item) => substituteValue(item, downloaded))
  if (typeof value === 'object' && value !== null) {
    return Object.fromEntries(
      Object.entries(value).map(([k, v]) => [
        k,
        substituteValue(v, downloaded),
      ]),
    )
  }
  return value
}

function isMediaRef(value: unknown): value is MediaRef {
  return (
    typeof value === 'object' &&
    value !== null &&
    'url' in value &&
    'hash' in value &&
    typeof value.url === 'string' &&
    typeof value.hash === 'string'
  )
}

export class EvaluatedResource {
  constructor(
    readonly resource: PageSpec,
    readonly payload: UnknownPayload,
  ) {}

  mediaUrls(): MediaRef[] {
    const out: MediaRef[] = []
    this.#collectFromSchema(this.resource.$fields, this.payload, out)
    return out
  }

  substituteMediaRefs(
    downloaded: Record<string, DownloadedMedia>,
  ): UnknownPayload {
    return substituteValue(this.payload, downloaded) as UnknownPayload
  }

  #collectFromSchema(
    schema: Record<string, FieldDescriptor>,
    payload: UnknownPayload,
    out: MediaRef[],
  ) {
    for (const [key, descriptor] of Object.entries(schema)) {
      if (isVariantArray(descriptor)) {
        const value = payload[key]
        if (
          typeof value === 'object' &&
          value !== null &&
          !Array.isArray(value)
        ) {
          for (const variant of descriptor) {
            if (variant.$fields) {
              this.#collectFromSchema(
                variant.$fields,
                value as UnknownPayload,
                out,
              )
            }
          }
        }
      } else if (isArrayField(descriptor)) {
        const items = payload[key]
        if (!Array.isArray(items)) continue
        if (descriptor.$extractor?.$extractor === 'media') {
          for (const item of items) {
            if (isMediaRef(item)) out.push(item)
          }
        } else {
          const fields = descriptor.$fields ?? {}
          for (const item of items) {
            if (typeof item === 'object' && item !== null) {
              this.#collectFromSchema(fields, item as UnknownPayload, out)
            }
          }
        }
      } else if (isMediaNodeField(descriptor)) {
        const value = payload[key]
        if (isMediaRef(value)) {
          out.push(value)
        }
      }
    }
  }
}
