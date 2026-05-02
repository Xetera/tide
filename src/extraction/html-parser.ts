import { NumberParser } from '@internationalized/number'
import { PageEvaluator } from './page-evaluator'
import { JsonataExpression } from './jsonata-bindings'
import type { MediaRef } from './evaluated-resource'
import type * as S from '~/site-spec/types'

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
    !('$sourceEach' in value) &&
    !('$literal' in value) &&
    ('$transform' in value ||
      '$fields' in value ||
      '$source' in value ||
      '$ifMissing' in value ||
      '$json' in value)
  )
}

function isArrayField(value: unknown): value is S.ArrayFieldDescriptor {
  return typeof value === 'object' && value !== null && '$sourceEach' in value
}

function isLiteral(value: unknown): value is S.LiteralFieldDescriptor {
  return typeof value === 'object' && value !== null && '$literal' in value
}

function isVariantArray(value: unknown): value is S.VariantDescriptor[] {
  return Array.isArray(value)
}

export interface HighlightEntry {
  element: Element
  label: { entity: string; field: string }
  isArrayItem?: boolean
}

export class HTMLParser {
  private numberParser?: NumberParser
  private _warnings: string[] = []
  private _highlights: HighlightEntry[] = []
  private _gone = false
  #mediaReady = new Map<string, Promise<void>>()
  #jsonResults = new Map<string, Promise<unknown>>()
  #entityPatches: S.EntityPatch[] = []
  #currentDocument!: Document
  #loaderResults: Record<string, unknown[]> = {}

  constructor(private readonly resource: S.PageSpec) {}

  get mediaReady(): ReadonlyMap<string, Promise<void>> {
    return this.#mediaReady
  }

  get highlights(): readonly HighlightEntry[] {
    return this._highlights
  }

  get warnings(): readonly string[] {
    return Object.freeze(this._warnings)
  }

  get gone(): boolean {
    return this._gone
  }

  get entityPatches(): readonly S.EntityPatch[] {
    return this.#entityPatches
  }

  async parseAsync(
    html: string | Document,
    options: {
      maxWait?: number
      loaderResults?: Record<string, unknown[]>
    } = {},
  ): Promise<S.EntityPatch[]> {
    this._warnings = []
    this._highlights = []
    this._gone = false
    this.#mediaReady = new Map()
    this.#jsonResults = new Map()
    this.#entityPatches = []
    this.#loaderResults = options.loaderResults ?? {}
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
    await PageEvaluator.waitForLoad(doc, this.resource, {
      maxWait: options.maxWait ?? 10_000,
    })
    const fields = this.#process(doc)
    await Promise.race([
      Promise.all(this.#mediaReady.values()),
      new Promise<void>((resolve) => setTimeout(resolve, 2000)),
    ])
    for (const [path, promise] of this.#jsonResults) {
      const value = await promise
      this.#setNestedPath(fields, path, value)
    }
    const mainPatch: S.EntityPatch = {
      _entity: this.resource.$entity,
      ...fields,
    }
    return [mainPatch, ...this.#entityPatches]
  }

  parse(
    html: string | Document,
    options: { loaderResults?: Record<string, unknown[]> } = {},
  ): S.EntityPatch[] {
    this._warnings = []
    this._highlights = []
    this._gone = false
    this.#mediaReady = new Map()
    this.#jsonResults = new Map()
    this.#entityPatches = []
    this.#loaderResults = options.loaderResults ?? {}
    const element = HTMLParser.createDocument(html)
    const fields = this.#process(element)
    const mainPatch: S.EntityPatch = {
      _entity: this.resource.$entity,
      ...fields,
    }
    return [mainPatch, ...this.#entityPatches]
  }

  #process(document: Document): S.UnknownPayload {
    try {
      this.#currentDocument = document
      this.numberParser = new NumberParser('en')

      if (
        this.resource.$gone &&
        this.#matchExpression(document, this.resource.$gone)
      ) {
        this._gone = true
        console.warn('Document is marked $gone')
        return {}
      }

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
      const source = descriptor.$source
      let value: unknown
      if (source && '$css' in source) {
        const node = document.querySelector(source.$css) as HTMLElement | null
        if (!node) {continue}
        value = this.#runTransform(node, descriptor.$transform ?? [])
      } else if (!source) {
        value = this.#runTransform(
          document as unknown as HTMLElement,
          descriptor.$transform ?? [],
        )
      }
      out[key] = value
    }
    return out
  }

  #resolveLoaderResult(name: string): unknown | null {
    const results = this.#loaderResults[name]
    if (!results || results.length === 0) {return null}
    return results[results.length - 1] ?? null
  }

  #resolveSource(
    source: S.SourceDescriptor,
    context: ParentNode,
  ): HTMLElement | { loaderResult: unknown } | null {
    if ('$css' in source) {
      return (
        context instanceof Element ? context : this.#currentDocument
      ).querySelector(source.$css) as HTMLElement | null
    }
    const result = this.#resolveLoaderResult(source.$query)
    if (result === null) {return null}
    return { loaderResult: result }
  }

  #resolveSourceEach(
    source: S.SourceEachDescriptor,
    context: ParentNode,
  ): HTMLElement[] {
    return Array.from(
      context.querySelectorAll(source.$cssEach),
    ) as HTMLElement[]
  }

  #runTransform(value: unknown, steps: S.TransformStep[]): unknown {
    return steps.reduce((acc, step) => this.#applyStep(acc, step), value)
  }

  #applyStep(value: unknown, step: S.TransformStep): unknown {
    if ('$text' in step) {
      if (!(value instanceof Element)) {
        this.#warn('$text step requires an HTMLElement')
        return null
      }
      const cloned = this.#normalizeTextContentBehavior(value as HTMLElement)
      return cloned.textContent
    }
    if ('$attr' in step) {
      if (!(value instanceof Element)) {
        this.#warn('$attr step requires an HTMLElement')
        return null
      }
      return (value as HTMLElement).getAttribute(step.$attr)
    }
    if ('$media' in step) {
      if (!(value instanceof Element)) {
        this.#warn('$media step requires an HTMLElement')
        return null
      }
      return this.#extractMedia(value as HTMLElement, step.$media)
    }
    if ('$exists' in step) {
      return true
    }

    if ('$regex' in step) {
      if (typeof value !== 'string') {
        throw new Error(
          `$regex step requires a string value, got: ${typeof value}`,
        )
      }
      const regex = new RegExp(step.$regex)
      if (step.$replacement === undefined || step.$replacement === null) {
        const group = step.$group ?? 1
        return value.match(regex)?.[group] ?? null
      }
      return value.replace(regex, step.$replacement)
    }
    if ('$cast' in step) {
      return this.#transformCast(value, step)
    }
    if ('$trim' in step) {
      if (typeof value !== 'string') {
        throw new Error(`$trim step requires a string value`)
      }
      let out = value
      if (step.$trim.includes('inside')) {
        out = out.replaceAll(/ +/g, ' ')
        out = out.replaceAll(/\s*\n\s*/g, '\n')
      }
      if (step.$trim.includes('outside')) {
        out = out.trim()
      }
      return out
    }
    if ('$fallback' in step) {
      return value ?? step.$fallback
    }
    if ('$lowercase' in step) {
      return typeof value === 'string' ? value.toLowerCase() : value
    }
    if ('$expandSuffix' in step) {
      return this.#transformExpandSuffix(value)
    }
    const _: never = step
    this.#warn(`Unknown transform step: ${JSON.stringify(_)}`)
    return value
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

  #setNestedPath(
    payload: S.UnknownPayload,
    path: string,
    value: unknown,
  ): void {
    const parts = path.split('.')
    let target: Record<string, unknown> = payload
    for (let i = 0; i < parts.length - 1; i++) {
      const part = parts[i]!
      if (
        !(part in target) ||
        typeof target[part] !== 'object' ||
        target[part] === null
      ) {
        target[part] = {}
      }
      target = target[part] as Record<string, unknown>
    }
    const last = parts[parts.length - 1]!
    if (value !== undefined) {
      target[last] = value
    }
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
    let node: HTMLElement | { loaderResult: unknown } | null

    if (descriptor.$source) {
      node = this.#resolveSource(descriptor.$source, element)
    } else {
      node = element as HTMLElement
    }

    if (!node) {
      const hasExists = descriptor.$transform?.some((s) => '$exists' in s)
      if (hasExists) {return false}
      if (descriptor.$ifMissing) {
        return this.#handleIfMissing(descriptor.$ifMissing, key, label)
      }
      throw new ParserError(
        descriptor,
        `No node was found and no fallback was provided [field] ${label}`,
      )
    }

    if (node instanceof Element) {
      this.#highlight(node, label)
    }

    if ('loaderResult' in node) {
      return node.loaderResult
    }

    if (descriptor.$json) {
      this.#jsonResults.set(label, this.#runJsonata(descriptor.$json, node))
      return undefined
    }
    if (descriptor.$fields) {
      if (!(node instanceof Element)) {
        this.#warn(`$fields requires a DOM element at ${label}`)
        return undefined
      }
      return this.#parseFields(node, descriptor.$fields, label)
    }
    if (descriptor.$transform) {
      return this.#runTransform(node, descriptor.$transform)
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
        if (isLiteral(v)) {return v.$literal}
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
    const items = this.#resolveSourceEach(descriptor.$sourceEach, element)

    if (items.length === 0 && descriptor.$ifMissing) {
      return this.#handleIfMissing(descriptor.$ifMissing, '', label)
    }

    return items.map((item) => {
      this.#highlight(item, label, true)
      if (descriptor.$transform) {
        return this.#runTransform(item, descriptor.$transform)
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
      let node: HTMLElement | { loaderResult: unknown } | null
      if (variant.$source) {
        node = this.#resolveSource(variant.$source, element)
      } else {
        node = element
      }
      if (!node) {continue}
      if (node instanceof Element) {
        this.#highlight(node, label)
      }
      return this.#parseVariant(node, variant, label)
    }
    const last = variants.at(-1)
    if (last?.$ifMissing) {
      return this.#handleIfMissing(last.$ifMissing, key, label)
    }
    return undefined
  }

  #parseVariant(
    node: HTMLElement | { loaderResult: unknown },
    variant: S.VariantDescriptor,
    label: string,
  ): unknown {
    if (variant.$literal !== undefined) {
      return variant.$literal
    }
    if ('loaderResult' in node) {
      return node.loaderResult
    }
    if (variant.$transform) {
      return this.#runTransform(node, variant.$transform)
    }
    if (variant.$sourceEach) {
      const items = this.#resolveSourceEach(variant.$sourceEach, node)
      return items.map((item) => {
        if (item instanceof Element) {
          this.#highlight(item, label)
        }
        return this.#parseFields(item, variant.$fields ?? {}, label)
      })
    }
    if (!(node instanceof Element)) {
      this.#warn(`$fields in variant requires a DOM element at ${label}`)
      return undefined
    }
    return this.#parseFields(node, variant.$fields ?? {}, label)
  }

  async #runJsonata(expr: string, value: unknown): Promise<unknown> {
    let input: unknown = value

    if (typeof value === 'string') {
      try {
        input = JSON.parse(value)
      } catch {
        input = value
      }
    }

    try {
      const expression = new JsonataExpression(expr)
      const result = await expression.evaluate(input)
      const entities = await expression.entities(input)
      for (const entity of entities) {
        this.#entityPatches.push(entity)
      }
      return result
    } catch (err) {
      this.#warn(
        `$json expression error: ${err instanceof Error ? err.message : String(err)}`,
      )
      return null
    }
  }

  #extractMedia(
    element: HTMLElement,
    options: Partial<S.MediaOptions>,
  ): unknown {
    const src = (
      (element instanceof HTMLImageElement
        ? element.currentSrc || null
        : null) ??
      element.getAttribute('src') ??
      element.getAttribute('href')
    )?.trim()
    const url = this.#castUrl(src)
    const hash = fnv1a(url)
    if (!this.#mediaReady.has(hash)) {
      const ready = new Promise<void>((resolve) => {
        if (
          !(element instanceof HTMLImageElement) &&
          !(element instanceof HTMLVideoElement)
        ) {
          resolve()
          return
        }
        if (
          (element instanceof HTMLImageElement && element.complete) ||
          (element instanceof HTMLVideoElement && element.readyState >= 2)
        ) {
          resolve()
          return
        }
        element.addEventListener('load', () => resolve(), { once: true })
        element.addEventListener('loadeddata', () => resolve(), { once: true })
        element.addEventListener('error', () => resolve(), { once: true })
      })
      this.#mediaReady.set(hash, ready)
    }
    const ref: MediaRef = { url, hash }
    if (options.$offload !== undefined) {ref.offload = options.$offload}
    if (options.$urlExpires !== undefined) {ref.urlExpires = options.$urlExpires}
    return ref
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

  #transformCast(
    value: unknown,
    step: Extract<S.TransformStep, { $cast: string }>,
  ): unknown {
    if (value === null || value === undefined) {return null}
    if (step.$cast === 'url') {
      return this.#castUrl(value)
    } else if (step.$cast === 'number') {
      if (typeof value === 'number') {return value}
      if (typeof value === 'string') {
        if (!this.numberParser) {
          throw new Error(
            'this.numberParser is undefined. This should never happen',
          )
        }
        const forceLocale = step.$options?.$forceLocale
        const parser = forceLocale
          ? new NumberParser(forceLocale)
          : this.numberParser
        return parser.parse(value)
      }
      return null
    } else if (step.$cast === 'date') {
      if (typeof value === 'string') {
        const d = new Date(value)
        return isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10)
      }
      return null
    }
    throw new Error('Invalid cast type')
  }

  #transformExpandSuffix(value: unknown): unknown {
    if (typeof value !== 'string') {
      return value
    }
    const suffixes: Record<string, number> = {
      K: 1_000,
      M: 1_000_000,
      B: 1_000_000_000,
    }
    const match = value.match(/^([\d.]+)\s*([KMB])$/i)
    if (!match) {
      return value
    }
    const multiplier = suffixes[match[2]!.toUpperCase()] ?? 1
    return String(parseFloat(match[1]!) * multiplier)
  }

  private static createDocument(html: string | Document): Document {
    if (typeof html !== 'string') {return html}
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

  #matchExpression(node: Node, expr: S.MatchExpression): boolean {
    if ('$css' in expr) {
      return (node as ParentNode).querySelector(expr.$css) !== null
    }
    const result = (node.ownerDocument ?? (node as Document)).evaluate(
      expr.$xpath,
      node,
      null,
      XPathResult.BOOLEAN_TYPE,
      null,
    )
    return result.booleanValue
  }

  #highlight(element: Element, label: string, isArrayItem?: boolean) {
    this._highlights.push({ element, label, isArrayItem })
  }

  #warn(warning: string) {
    this._warnings.push(warning)
  }
}

export class BailSignal {}

export class ParserError extends Error {
  constructor(
    public readonly descriptor: S.NodeFieldDescriptor,
    message: string,
  ) {
    const source =
      descriptor.$source && '$css' in descriptor.$source
        ? descriptor.$source.$css
        : descriptor.$source && '$query' in descriptor.$source
          ? `query:${descriptor.$source.$query}`
          : '(none)'
    super(`${message} [source] ${source}`)
  }
}
