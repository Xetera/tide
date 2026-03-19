import { NumberParser } from '@internationalized/number'
import { PageEvaluator } from './page-evaluator'
import type * as S from './scrapeer'

function fnv1a(str: string): string {
  let hash = 0x811c9dc5
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i)
    hash = (hash * 0x01000193) >>> 0
  }
  return hash.toString(36)
}

function isNodeField(value: unknown): value is S.NodeFieldDescriptor {
  return (
    typeof value === 'object' &&
    value !== null &&
    !('$selectorEach' in value) &&
    !('$literal' in value) &&
    ('$extractor' in value ||
      '$fields' in value ||
      '$selector' in value ||
      '$ifMissing' in value)
  )
}

function isArrayField(value: unknown): value is S.ArrayFieldDescriptor {
  return typeof value === 'object' && value !== null && '$selectorEach' in value
}

function isLiteral(value: unknown): value is S.LiteralFieldDescriptor {
  return typeof value === 'object' && value !== null && '$literal' in value
}

function isVariantArray(value: unknown): value is S.VariantDescriptor[] {
  return Array.isArray(value)
}

export interface HighlightEntry {
  element: Element
  label: string
}

export class HTMLParser {
  private numberParser?: NumberParser
  private _warnings: string[] = []
  private _highlights: HighlightEntry[] = []

  #currentDocument!: Document

  constructor(private readonly resource: S.Resource) {}

  get highlights(): readonly HighlightEntry[] {
    return this._highlights
  }

  get warnings(): readonly string[] {
    return Object.freeze(this._warnings)
  }

  async parseAsync(
    html: string | Document,
    { maxWait = 10_000 } = {},
  ): Promise<S.UnknownPayload> {
    this._warnings = []
    this._highlights = []
    const doc = HTMLParser.createDocument(html)
    const waitFor = this.resource.$waitFor
    if (
      waitFor?.length &&
      waitFor.every((s) => doc.querySelector(s) !== null)
    ) {
      this.#warn(
        `wait_for selectors were immediately available — page may have been pre-rendered: ${waitFor.join(', ')}`,
      )
    }
    await PageEvaluator.waitForLoad(doc, this.resource, { maxWait })
    return this.#process(doc)
  }

  parse(html: string | Document) {
    this._warnings = []
    this._highlights = []
    const element = HTMLParser.createDocument(html)
    return this.#process(element)
  }

  #process(document: Document): S.UnknownPayload {
    try {
      this.#currentDocument = document
      this.numberParser = new NumberParser('en')

      if (this.resource.$meta) {
        const meta = this.#parseMeta(document, this.resource.$meta)
        if (typeof meta.locale === 'string') {
          this.numberParser = new NumberParser(meta.locale)
        }
      }

      return this.#parseFields(document.body, this.resource.$fields, '')
    } catch (err) {
      if (err instanceof BailSignal) {
        return {}
      }
      throw err
    }
  }

  #parseMeta(
    document: Document,
    meta: Record<string, S.NodeFieldDescriptor>,
  ): Record<string, unknown> {
    const out: Record<string, unknown> = {}
    for (const [key, descriptor] of Object.entries(meta)) {
      const node = document.querySelector(
        descriptor.$selector,
      ) as HTMLElement | null
      if (!node) continue
      const value = this.#runExtractor(node, descriptor.$extractor)
      out[key] = value
    }
    return out
  }

  #parseFields(
    element: ParentNode,
    schema: Record<string, S.FieldDescriptor>,
    prefix: string,
  ): S.UnknownPayload {
    const out: S.UnknownPayload = {}
    for (const key of Object.keys(schema)) {
      const label = prefix ? `${prefix}.${key}` : key
      const descriptor = schema[key]
      if (isVariantArray(descriptor)) {
        const result = this.#parseVariantsField(
          element as HTMLElement,
          key,
          descriptor,
          label,
        )
        if (result !== undefined) {
          this.#setKey(key, out, result)
        }
      } else if (isLiteral(descriptor)) {
        this.#setKey(key, out, descriptor.$literal)
      } else if (isArrayField(descriptor)) {
        const result = this.#parseArrayField(
          element as HTMLElement,
          descriptor,
          label,
        )
        if (result !== undefined) {
          this.#setKey(key, out, result)
        }
      } else if (isNodeField(descriptor)) {
        const result = this.#parseNodeField(
          element as ParentNode,
          key,
          descriptor,
          label,
        )
        if (result !== undefined) {
          this.#setKey(key, out, result)
        }
      }
    }
    return out
  }

  #setKey(key: string, object: Record<string, unknown>, value: unknown): void {
    const fields = key.split('.')
    if (fields.length === 1) {
      object[key] = value
      return
    }
    const init = fields.slice(0, -1)
    const last = fields.at(-1) as string
    let target: Record<string, any> = object
    for (const section of init) {
      if (!(section in target)) {
        target[section] = {}
      }
      target = target[section]
    }
    target[last] = value
  }

  #parseNodeField(
    element: ParentNode,
    key: string,
    descriptor: S.NodeFieldDescriptor,
    label: string,
  ): unknown {
    const node = (
      descriptor.$selector
        ? element.querySelector(descriptor.$selector)
        : element
    ) as HTMLElement | null

    if (!node) {
      if (descriptor.$extractor?.$extractor === 'exists') {
        return false
      }
      if (descriptor.$ifMissing) {
        return this.#handleIfMissing(descriptor.$ifMissing, key, label)
      }
      throw new ParserError(
        descriptor.$selector,
        'No node was found and no fallback was provided',
      )
    }

    this.#highlight(node, label)
    if (descriptor.$fields) {
      return this.#parseFields(node, descriptor.$fields, label)
    }
    if (descriptor.$extractor) {
      return this.#runExtractor(node, descriptor.$extractor)
    }
    return undefined
  }

  #handleIfMissing(
    ifMissing: S.IfMissing,
    key: string,
    label: string,
  ): unknown {
    if ('$warning' in ifMissing && ifMissing.$warning) {
      this.#warn(ifMissing.$warning)
    }
    switch (ifMissing.$strategy) {
      case 'bail':
        throw new BailSignal()
      case 'omit':
        return undefined
      case 'fallback': {
        const v = ifMissing.$value
        if (isLiteral(v)) return v.$literal
        if (isNodeField(v)) {
          return this.#parseNodeField(this.#currentDocument.body, key, v, label)
        }
        return undefined
      }
    }
  }

  #parseArrayField(
    element: HTMLElement,
    descriptor: S.ArrayFieldDescriptor,
    label: string,
  ): unknown[] | unknown {
    const items = element.querySelectorAll(
      descriptor.$selectorEach,
    ) as NodeListOf<HTMLElement>
    console.log('ITEMS', items, element, descriptor.$selectorEach)

    if (items.length === 0 && descriptor.$ifMissing) {
      return this.#handleIfMissing(descriptor.$ifMissing, '', label)
    }

    return Array.from(items, (item) => {
      this.#highlight(item, label)
      if (descriptor.$extractor) {
        return this.#runExtractor(item, descriptor.$extractor)
      }
      return this.#parseFields(item, descriptor.$fields ?? {}, label)
    })
  }

  #parseVariantsField(
    element: HTMLElement,
    key: string,
    variants: S.VariantDescriptor[],
    label: string,
  ): unknown {
    for (const variant of variants) {
      const node = (
        variant.$selector ? element.querySelector(variant.$selector) : element
      ) as HTMLElement | null
      if (!node) continue
      this.#highlight(node, label)
      return this.#parseVariant(node, variant, label)
    }
    const last = variants.at(-1)
    if (last?.$ifMissing) {
      return this.#handleIfMissing(last.$ifMissing, key, label)
    }
    return undefined
  }

  #parseVariant(
    node: HTMLElement,
    variant: S.VariantDescriptor,
    label: string,
  ): unknown {
    if (variant.$extractor) {
      return this.#runExtractor(node, variant.$extractor)
    }
    if (variant.$selectorEach) {
      const items = node.querySelectorAll(
        variant.$selectorEach,
      ) as NodeListOf<HTMLElement>
      return Array.from(items, (item) => {
        this.#highlight(item, label)
        return this.#parseFields(item, variant.$fields ?? {}, label)
      })
    }
    return this.#parseFields(node, variant.$fields ?? {}, label)
  }

  #runExtractor(
    element: HTMLElement,
    extractor: S.ExtractorDescriptor,
  ): unknown {
    switch (extractor.$extractor) {
      case 'text':
        return this.#extractText(element, extractor)
      case 'attribute':
        return this.#extractAttribute(element, extractor)
      case 'media':
        return this.#extractMedia(element, extractor)
      case 'exists':
        return true
      default: {
        extractor satisfies never
        throw new Error('Invalid extractor kind')
      }
    }
  }

  #extractText(
    element: HTMLElement,
    extractor: S.TextExtractorDescriptor,
  ): unknown {
    const cloned = this.#normalizeTextContentBehavior(element)
    return this.#transformAll(cloned.textContent, extractor.$transformers ?? [])
  }

  #extractAttribute(
    element: HTMLElement,
    extractor: S.AttributeExtractorDescriptor,
  ): unknown {
    const value = element.getAttribute(extractor.$attribute)
    return this.#transformAll(value, extractor.$transformers ?? [])
  }

  #extractMedia(
    element: HTMLElement,
    extractor: S.MediaExtractorDescriptor,
  ): unknown {
    const src = element.getAttribute('src') ?? element.getAttribute('href')
    const transformed = this.#transformAll(src, extractor.$transformers ?? [])
    const url = this.#castUrl(transformed)
    const hash = fnv1a(url)
    return { url, hash }
  }

  #castUrl(value: unknown): string {
    if (typeof value !== 'string') {
      throw new Error(`Invalid URL: ${value}`)
    }
    try {
      return new URL(value).toString()
    } catch {
      return new URL(value, `https://${this.resource.$hostname}`).toString()
    }
  }

  #transformAll(
    value: unknown,
    transformers: S.TransformerDescriptor[],
  ): unknown {
    return transformers.reduce((acc, t) => this.#transform(acc, t), value)
  }

  #transform(value: unknown, transformer: S.TransformerDescriptor): unknown {
    switch (transformer.$transformer) {
      case 'regex':
        return this.#transformRegex(value, transformer)
      case 'cast':
        return this.#transformCast(value, transformer)
      case 'fallback':
        return value ?? transformer.$value
      case 'trim':
        return this.#transformTrim(value, transformer)
      case 'lowercase':
        return typeof value === 'string' ? value.toLowerCase() : value
      case 'expand-suffix':
        return this.#transformExpandSuffix(value)
      default: {
        // @ts-expect-error
        const _: never = transformer
        if ('$transformer' in transformer) {
          // @ts-expect-error
          this.#warn(`Invalid transformer kind: ${transformer.$transformer}`)
        } else {
          this.#warn(`Invalid transformer: ${transformer}`)
        }
        return value
      }
    }
  }

  #transformRegex(
    value: unknown,
    transformer: S.RegexTransformerDescriptor,
  ): unknown {
    if (typeof value !== 'string') {
      throw new Error(`Invalid value: ${value}`)
    }
    const regex = new RegExp(transformer.$regex)
    if (
      transformer.$replacement === undefined ||
      transformer.$replacement === null
    ) {
      const group = transformer.$group ?? 1
      return value.match(regex)?.[group] ?? null
    }
    return value.replace(regex, transformer.$replacement)
  }

  #transformCast(
    value: unknown,
    transformer: S.CastTransformerDescriptor,
  ): unknown {
    if (value === null || value === undefined) return null
    if (transformer.$cast === 'url') {
      return this.#castUrl(value)
    } else if (transformer.$cast === 'number') {
      if (typeof value === 'number') return value
      if (typeof value === 'string') {
        if (!this.numberParser) {
          throw new Error(
            'this.numberParser is undefined. This should never happen',
          )
        }
        const parser = transformer.$options?.$forceLocale
          ? new NumberParser(transformer.$options.$forceLocale)
          : this.numberParser
        return parser.parse(value)
      }
      return null
    } else if (transformer.$cast === 'date') {
      if (typeof value === 'string') {
        const d = new Date(value)
        return isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10)
      }
      return null
    }
    transformer satisfies never
    throw new Error('Invalid cast type')
  }

  #transformTrim(
    value: unknown,
    transformer: S.TrimTransformerDescriptor,
  ): string {
    if (typeof value !== 'string') {
      throw new Error(`Invalid value: ${value}`)
    }
    let out = value
    if (transformer.$options.includes('inside')) {
      out = out.replaceAll(/ +/g, ' ')
      out = out.replaceAll(/\s*\n\s*/g, '\n')
    }
    if (transformer.$options.includes('outside')) {
      out = out.trim()
    }
    return out
  }

  #transformExpandSuffix(value: unknown): unknown {
    if (typeof value !== 'string') return value
    const suffixes: Record<string, number> = {
      K: 1_000,
      M: 1_000_000,
      B: 1_000_000_000,
    }
    const match = value.match(/^([\d.]+)\s*([KMB])$/i)
    if (!match) return value
    const multiplier = suffixes[match[2].toUpperCase()]
    return String(parseFloat(match[1]) * multiplier)
  }

  private static createDocument(html: string | Document): Document {
    if (typeof html !== 'string') return html
    return new DOMParser().parseFromString(html, 'text/html')
  }

  /**
   * In some cases, `<br>` elements separate two pieces of text from each other,
   * which is the only thing that makes parsing possible. Sadly browsers ignore
   * `<br>` with `.textContent` and `innerText` only turns those elements into
   * newlines if the node being parsed is attached to the document body.
   * {@link https://github.com/capricorn86/happy-dom/issues/344#issuecomment-1173212511}
   *
   * This method normalizes that behavior so we can rely on .textContent
   */
  #normalizeTextContentBehavior(element: HTMLElement): HTMLElement {
    const clone = element.cloneNode(true) as HTMLElement
    for (const brs of clone.querySelectorAll('br')) {
      brs.replaceWith('\n')
    }
    for (const script of clone.querySelectorAll('script')) {
      script.remove()
    }
    for (const style of clone.querySelectorAll('style')) {
      style.remove()
    }
    return clone
  }

  #highlight(element: Element, label: string) {
    this._highlights.push({ element, label })
  }

  #warn(warning: string) {
    this._warnings.push(warning)
  }
}

export class BailSignal {}

export class ParserError extends Error {
  constructor(
    public readonly selector: string,
    message: string,
  ) {
    super(`${message} [selector] ${selector}`)
  }
}
