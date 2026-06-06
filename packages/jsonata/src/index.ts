import jsonata from 'jsonata'
import {
  expandLocaleSuffix,
  parseLocaleNumber,
  parseMoney,
  type MoneyValue,
} from '@tide/parsers'

export type MediaRef = {
  _type: 'image' | 'video'
  url: string
  width?: number
  height?: number
}

export type EntityRef = {
  _type: 'ref'
  _id: string
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
    this.#expr = JsonataExpression.evaluator(expression)
    if (context.request) {
      this.#expr.assign('request', context.request)
    }
    if (context.response) {
      this.#expr.assign('response', context.response)
    }
  }

  static default(expression: string) {
    return new this(expression)
  }

  static evaluator(expression: string) {
    const evaluator = jsonata(expression)

    evaluator.assign('image', (url: unknown): MediaRef | null => {
      if (typeof url !== 'string') {
        return null
      }
      return { _type: 'image', url }
    })

    evaluator.assign('video', (url: unknown): MediaRef | null => {
      if (typeof url !== 'string') {
        return null
      }
      return { _type: 'video', url }
    })

    evaluator.assign('unique_id', (obj: unknown, id: unknown) => {
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

    evaluator.assign(
      'with_dimensions',
      (media: unknown, width: unknown, height: unknown) => {
        if (media === null || typeof media !== 'object') {
          return media
        }
        return { ...media, width, height }
      },
    )

    evaluator.assign('ref', (id: unknown): EntityRef | EntityRef[] | null => {
      if (id == null) {
        return null
      }
      if (Array.isArray(id)) {
        return id.map((id) => ({ _type: 'ref', _id: String(id) }))
      }
      return { _type: 'ref', _id: String(id) }
    })

    evaluator.assign(
      'number',
      (value: unknown, locale: unknown): number | null => {
        if (value == null) {
          return null
        }
        const result = parseLocaleNumber(
          String(value),
          typeof locale === 'string' ? locale : 'en',
        )
        return Number.isNaN(result) ? null : result
      },
    )

    evaluator.assign(
      'money',
      (
        value: unknown,
        currency: unknown,
        locale: unknown,
      ): MoneyValue | null => {
        if (value == null) {
          return null
        }
        return parseMoney(
          String(value),
          typeof locale === 'string' ? locale : 'en',
          typeof currency === 'string' ? currency : null,
        )
      },
    )

    evaluator.assign(
      'expand_suffix',
      (value: unknown, locale: unknown): string | null => {
        if (value == null) {
          return null
        }
        return expandLocaleSuffix(
          String(value),
          typeof locale === 'string' ? locale : 'en',
        )
      },
    )

    evaluator.assign('query_param', (url: unknown, param: unknown) => {
      if (typeof url !== 'string' || typeof param !== 'string') {
        return null
      }
      try {
        return new URL(url).searchParams.get(param)
      } catch {
        return null
      }
    })

    evaluator.assign('timestamp', (value: unknown) => {
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
      return timestamp.toISOString()
    })
    return evaluator
  }

  async evaluate(input: unknown): Promise<unknown> {
    return this.#expr.evaluate(input as Record<string, unknown>)
  }
}

export class CompiledJsonata {
  #expr: ReturnType<typeof jsonata>

  constructor(expression: string) {
    this.#expr = JsonataExpression.evaluator(expression)
  }

  evaluateSync(input: unknown): unknown {
    let out: unknown
    let err: unknown
    let settled = false
    this.#expr.evaluate(
      input as Record<string, unknown>,
      {},
      (e: unknown, resp: unknown) => {
        settled = true
        err = e
        out = resp
      },
    )
    if (!settled) {
      throw new Error('jsonata expression evaluated asynchronously')
    }
    if (err) {
      throw err
    }
    return out
  }
}
