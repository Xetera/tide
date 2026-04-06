import jsonata from 'jsonata'
import type { EntityRef } from '~/site-spec/types'

type MediaRef = {
  _type: 'image' | 'video'
  url: string
  hash: string
  width?: number
  height?: number
}

export interface ParsedEntity {
  _entity: string
  _id: unknown
  _createdAt?: string
  [key: string]: unknown
}

export interface JsonataContext {
  request?: {
    url: string
    method: string
    headers: Record<string, string>
  }
  response?: {
    url: string
    status: number | null
    headers: Record<string, string>
    body: unknown
  }
}

export class JsonataExpression {
  #expr: ReturnType<typeof jsonata>

  constructor(expression: string, context: JsonataContext = {}) {
    this.#expr = jsonata(expression)

    if (context.request) this.#expr.assign('request', context.request)
    if (context.response) this.#expr.assign('response', context.response)

    this.#expr.assign('image', (url: unknown): MediaRef | null => {
      if (typeof url !== 'string') {
        return null
      }
      return { _type: 'image', url, hash: '' }
    })

    this.#expr.assign('video', (url: unknown): MediaRef | null => {
      if (typeof url !== 'string') {
        return null
      }
      return { _type: 'video', url, hash: '' }
    })

    this.#expr.assign('unique_id', (obj: unknown, id: unknown) => {
      // it's ok if id is undefined or null here
      if (id == null) {
        return null
      }
      if (typeof obj !== 'object' || obj === null) {
        throw new Error('Variable passed to unique_id is not an object: ' + obj)
      }
      id = String(id)
      return { _id: id, ...obj }
    })

    this.#expr.assign(
      'with_dimensions',
      (media: unknown, width: unknown, height: unknown) => {
        if (media === null || typeof media !== 'object') {
          return media
        }
        return { ...media, width, height }
      },
    )

    this.#expr.assign(
      'ref',
      (entityName: unknown, id: unknown): EntityRef | EntityRef[] | null => {
        if (typeof entityName !== 'string') {
          return null
        }
        if (Array.isArray(id)) {
          return id.map((id) => ({ _ref: entityName, id: String(id) }))
        }
        return { _ref: entityName, id: String(id) }
      },
    )

    this.#expr.assign('entity', (fields: unknown, entityName: unknown) => {
      if (typeof entityName !== 'string') {
        return null
      }
      if (Array.isArray(fields)) {
        return fields.map((field) => ({ _entity: entityName, ...field }))
      } else if (fields instanceof Object) {
        return { _entity: entityName, ...fields }
      }
      throw new Error('Invalid type of fields for: ' + entityName)
    })

    this.#expr.assign('timestamp', (value: unknown) => {
      let timestamp: Date
      if (typeof value === 'number') {
        timestamp = new Date(value)
        if (timestamp.getFullYear() === 1970) {
          timestamp = new Date(value * 1000)
        }
      } else if (typeof value === 'string') {
        timestamp = new Date(value)
      } else {
        return null
      }
      if (Number.isNaN(timestamp.getTime())) {
        throw new Error('Invalid time: ' + value)
      }
      return {
        _type: 'timestamp',
        value: timestamp.toISOString(),
        precision: 'full',
      }
    })
  }

  async evaluate(input: unknown): Promise<unknown> {
    return this.#expr.evaluate(input as Record<string, unknown>)
  }

  async entities(input: unknown): Promise<ParsedEntity[]> {
    const result = await this.#expr.evaluate(input as Record<string, unknown>)
    if (!Array.isArray(result)) {
      return []
    }
    return result.filter(
      (r): r is ParsedEntity =>
        r !== null && typeof r === 'object' && typeof r._entity === 'string',
    )
  }
}
