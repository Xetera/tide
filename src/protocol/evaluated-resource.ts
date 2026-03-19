import type { ArrayFieldDescriptor, FieldDescriptor, NodeFieldDescriptor, Resource, UnknownPayload, VariantDescriptor } from './scrapeer'

export interface MediaRef {
  url: string
  hash: string
}

function isVariantArray(value: FieldDescriptor): value is VariantDescriptor[] {
  return Array.isArray(value)
}

function isArrayField(value: FieldDescriptor): value is ArrayFieldDescriptor {
  return '$selectorEach' in value
}

function isMediaNodeField(value: FieldDescriptor): value is NodeFieldDescriptor & { $extractor: { $extractor: 'media' } } {
  return '$extractor' in value && typeof value.$extractor === 'object' && value.$extractor.$extractor === 'media'
}

function isMediaRef(value: unknown): value is MediaRef {
  return (
    typeof value === 'object' &&
    value !== null &&
    'url' in value &&
    'hash' in value &&
    typeof (value as Record<string, unknown>).url === 'string' &&
    typeof (value as Record<string, unknown>).hash === 'string'
  )
}

export class EvaluatedResource {
  constructor(
    readonly resource: Resource,
    readonly payload: UnknownPayload,
  ) {}

  mediaUrls(): MediaRef[] {
    const out: MediaRef[] = []
    this.#collectFromSchema(this.resource.$fields, this.payload, out)
    return out
  }

  #collectFromSchema(
    schema: Record<string, FieldDescriptor>,
    payload: UnknownPayload,
    out: MediaRef[],
  ) {
    for (const [key, descriptor] of Object.entries(schema)) {
      if (isVariantArray(descriptor)) {
        const value = payload[key]
        if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
          for (const variant of descriptor) {
            if (variant.$fields) {
              this.#collectFromSchema(variant.$fields, value as UnknownPayload, out)
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
