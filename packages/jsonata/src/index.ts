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
  #context: JsonataContext

  constructor(expression: string, context: JsonataContext = {}) {
    this.#expr = JsonataExpression.evaluator(expression)
    this.#context = context
  }

  static default(expression: string) {
    return new this(expression)
  }

  static evaluator(expression: string) {
    return jsonata(expression)
  }

  static bindings: Record<string, unknown> = {
    image(url: unknown): MediaRef | null {
      if (typeof url !== 'string') {
        return null
      }
      return { _type: 'image', url }
    },

    video(url: unknown): MediaRef | null {
      if (typeof url !== 'string') {
        return null
      }
      return { _type: 'video', url }
    },

    unique_id(obj: unknown, id: unknown) {
      // it's ok if id is undefined or null here
      if (id == null) {
        return null
      }
      if (typeof obj !== 'object' || obj === null) {
        throw new Error('Variable passed to unique_id is not an object: ' + obj)
      }
      id = String(id)
      return { _id: id, ...obj }
    },

    with_dimensions(media: unknown, width: unknown, height: unknown) {
      if (media === null || typeof media !== 'object') {
        return media
      }
      return { ...media, width, height }
    },

    ref(id: unknown): EntityRef | EntityRef[] | null {
      if (id == null) {
        return null
      }
      if (Array.isArray(id)) {
        return id.map((id) => ({ _type: 'ref', _id: String(id) }))
      }
      return { _type: 'ref', _id: String(id) }
    },

    number(value: unknown, locale: unknown): number | null {
      if (value == null) {
        return null
      }
      const result = parseLocaleNumber(
        String(value),
        typeof locale === 'string' ? locale : 'en',
      )
      return Number.isNaN(result) ? null : result
    },

    money(value: unknown, options: unknown): MoneyValue | null {
      if (value == null) {
        return null
      }
      const config =
        typeof options === 'object' && options !== null
          ? (options as { currency?: unknown; locale?: unknown })
          : {}
      return parseMoney(
        String(value),
        typeof config.locale === 'string' ? config.locale : 'en',
        typeof config.currency === 'string' ? config.currency : null,
      )
    },

    expand_suffix(value: unknown, locale: unknown): string | null {
      if (value == null) {
        return null
      }
      return expandLocaleSuffix(
        String(value),
        typeof locale === 'string' ? locale : 'en',
      )
    },

    query_param(url: unknown, param: unknown) {
      if (typeof url !== 'string' || typeof param !== 'string') {
        return null
      }
      try {
        return new URL(url).searchParams.get(param)
      } catch {
        return null
      }
    },

    timestamp(value: unknown) {
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
    },

    // site-specific functionality
    sahibinden: {
      // Sahibinden's map markers only expose abbreviated prices ("15,2 M",
      // "120 bin", "1.213 M"), never the exact value. The display rounds to
      // 3 significant figures and the suffix slides with magnitude, but the
      // suffix is capped at millions ("M"): once the value reaches billions it
      // stays on "M" with a longer mantissa ("1.213 M") rather than switching
      // to a finer-than-millions grain. The displayed value therefore only
      // pins the real amount to a round-to-nearest step equal to the place
      // value of its least significant shown digit. That step is the 3rd-sig-
      // fig grain, never finer than the millions cap of the suffix bucket.
      precision(money: unknown): MoneyValue {
        JsonataExpression.assertMoney(money)
        const amount = Math.abs(money.amount)
        if (amount <= 0) {
          return money
        }
        const SIG_FIGS = 3
        const MILLIONS = 1_000_000
        const sigFigStep =
          10 ** (Math.floor(Math.log10(amount)) - (SIG_FIGS - 1))
        const step = Math.min(sigFigStep, MILLIONS)
        return { ...money, precision: { step } }
      },
    },
  }

  static assertMoney(value: unknown): asserts value is MoneyValue {
    if (
      typeof value !== 'object' ||
      value === null ||
      (value as { _type?: unknown })._type !== 'money' ||
      typeof (value as { amount?: unknown }).amount !== 'number'
    ) {
      throw new Error(`${JSON.stringify(value)} is not a valid money type`)
    }
  }

  async evaluate(input: unknown): Promise<unknown> {
    return this.#expr.evaluate(input as Record<string, unknown>, {
      ...JsonataExpression.bindings,
      ...(this.#context.request ? { request: this.#context.request } : {}),
      ...(this.#context.response ? { response: this.#context.response } : {}),
    })
  }
}

export class CompiledJsonata {
  #expr: ReturnType<typeof jsonata>

  constructor(expression: string) {
    this.#expr = JsonataExpression.evaluator(expression)
  }

  async evaluate(input: unknown): Promise<unknown> {
    return this.#expr.evaluate(
      input as Record<string, unknown>,
      JsonataExpression.bindings,
    )
  }
}
