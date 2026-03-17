import { NumberParser } from '@internationalized/number'
import { PageEvaluator } from './page-evaluator'
import type * as S from './scrapeer'

export class HTMLParser {
  // this changes based on the locale of the document being parsed
  private numberParser?: NumberParser
  private _warnings: string[] = []

  #currentDocument!: Document

  constructor(private readonly resource: S.Resource) {}

  get warnings(): readonly string[] {
    return Object.freeze(this._warnings)
  }

  /**
   * Parses an HTML document after waiting for it to load based on the resource definition
   */
  async parseAsync(
    html: string | Document,
    { timeout = 500 } = {},
  ): Promise<S.UnknownPayload> {
    this._warnings = []
    const doc = HTMLParser.createDocument(html)

    if (this.resource.wait_for) {
      const { readyAfterTries } = await PageEvaluator.waitForLoad(
        doc,
        this.resource,
        { timeout },
      )

      if (readyAfterTries === 0) {
        this.#warn('Document was ready immediately after load')
      }
    }

    return this.#process(doc)
  }

  parse(html: string | Document) {
    this._warnings = []
    const element = HTMLParser.createDocument(html)

    return this.#process(element)
  }

  #process(document: Document): S.UnknownPayload {
    try {
      this.#currentDocument = document
      this.numberParser = new NumberParser('en')
      if (this.resource.meta) {
        const meta = this.#parseMeta(document, this.resource.meta)
        if (meta.locale) {
          this.numberParser = new NumberParser(meta.locale)
        }
      }

      return this.select(document, this.resource.descriptors)
    } catch (err) {
      if (err instanceof BailSignal) {
        return {}
      }
      throw err
    }
  }

  select(document: Document, selectors: S.Selector[]): S.UnknownPayload {
    const output: S.UnknownPayload = {}
    for (const selector of selectors) {
      if (selector.kind === 'selector:array') {
        output[selector.key] = this.#selectArray(document.body, selector)
      } else if (selector.kind === 'selector:node') {
        Object.assign(output, this.#selectNode(document.body, selector))
      } else if (selector.kind === 'selector:self') {
        Object.assign(output, this.#selectSelf(document.body, selector))
      }
    }
    return output
  }

  private static createDocument(html: string | Document) {
    if (typeof html !== 'string') {
      return html
    }
    return new DOMParser().parseFromString(html, 'text/html')
  }

  #parseMeta(document: Document, selectors: S.NodeSelector[]) {
    const meta: { locale?: string; [key: string]: unknown } = {}
    for (const selector of selectors) {
      const nodeValues = this.#selectNode(
        // this is required to make selectNode happy.
        // there's definitely a way to fix it with a refactor but
        // I can't figure it our right now
        document as unknown as HTMLElement,
        selector,
      )

      Object.assign(meta, nodeValues)
    }
    return meta
  }

  #selectArray(element: HTMLElement, selector: S.ArraySelector) {
    const items = element.querySelectorAll(
      selector.selector,
    ) as NodeListOf<HTMLElement>
    return Array.from(items, (item) => {
      const data: Record<string, unknown> = {}
      const fields = selector.fields.flatMap((field) => {
        switch (field.kind) {
          case 'selector:node':
            return this.#selectNode(item, field)
          case 'selector:self':
            return this.#selectSelf(item, field)
          case 'selector:array':
            return { [field.key]: this.#selectArray(item, field) }
        }
      })
      for (const field of fields) {
        Object.assign(data, field)
      }

      return data
    })
  }

  #selectNode(
    element: HTMLElement,
    selector: S.NodeSelector,
  ): Record<string, unknown> {
    const node = element.querySelector(selector.selector) as HTMLElement | undefined

    if (!node) {
      if (selector.if_missing) {
        switch (selector.if_missing.kind) {
          case 'recovery:bail':
            throw new BailSignal()
          case 'recovery:fallback':
            return this.select(this.#currentDocument, [
              selector.if_missing.selector,
            ])
          case 'recovery:omit':
            return {}
        }
      }

      throw new ParserError(
        selector.selector,
        // pointer,
        'No node was found and no fallback was provided',
      )
    }

    const out: Record<string, unknown> = {}
    for (const extractor of selector.extractors) {
      const value = this.#extract(node, extractor)
      this.#mutateSubObjects(extractor.key, out, value)
    }
    return out
  }

  #selectSelf(
    element: HTMLElement,
    selector: S.SelfSelector,
  ): Record<string, unknown> {
    const out: Record<string, unknown> = {}
    for (const extractor of selector.extractors) {
      const value = this.#extract(element, extractor)
      this.#mutateSubObjects(extractor.key, out, value)
    }
    return out
  }

  #extract(element: HTMLElement, extractor: S.Extractor) {
    switch (extractor.kind) {
      case 'extractor:text': {
        return this.#extractText(element, extractor)
      }
      case 'extractor:attribute': {
        return this.#extractAttribute(element, extractor)
      }
      case 'extractor:style': {
        return this.#extractStyle(element, extractor)
      }
      default: {
        // @ts-expect-error
        const _: never = extractor
        throw new Error('Invalid extractor kind')
      }
    }
  }

  #extractStyle(element: HTMLElement, extractor: S.StyleExtractor) {
    const thisWindow = this.#currentDocument.defaultView
    if (!thisWindow) {
      throw new Error('No window instance found for current document')
    }

    const styles = thisWindow.getComputedStyle(element, extractor.pseudo)
    if (!styles) {
      this.#warn(
        `Could not find any styles for element being extracted for key ${extractor.key}`,
      )
      return
    }

    return styles[extractor.declaration]
  }

  #extractText(element: HTMLElement, extractor: S.TextExtractor) {
    const cloned = this.#normalizeTextContentBehavior(element)
    return this.#transformAll(cloned.textContent, extractor.transformers)
  }

  #extractAttribute(element: HTMLElement, extractor: S.AttributeExtractor) {
    const value = element.getAttribute(extractor.attribute)
    return this.#transformAll(value, extractor.transformers)
  }

  #transformAll(value: unknown, transformers: S.Transformer[]): unknown {
    return transformers.reduce((acc, transformer) => {
      return this.#transform(acc, transformer)
    }, value)
  }

  #transform(value: unknown, transformer: S.Transformer) {
    switch (transformer.kind) {
      case 'transformer:regex':
        return this.#transformRegex(value, transformer)
      case 'transformer:cast':
        return this.#transformCast(value, transformer)
      case 'transformer:fallback':
        return this.#transformFallback(value, transformer)
      case 'transformer:trim':
        return this.#transformTrim(value, transformer)
      default: {
        // @ts-expect-error
        const _: never = transformer
        if ('kind' in transformer) {
          // @ts-expect-error | transformer.kind must exist
          this.#warn(`Invalid transformer kind: ${transformer.kind}`)
        } else {
          this.#warn(`Invalid transformer: ${transformer}`)
        }
        return value
      }
    }
  }

  #transformTrim(value: unknown, transformer: S.TrimTransformer): string {
    if (typeof value !== 'string') {
      throw new Error(`Invalid value: ${value}`)
    }

    let out: string = value

    if (transformer.options.includes('inside')) {
      out = out.replaceAll(/ +/g, ' ')
      out = out.replaceAll(/\s*\n\s*/g, '\n')
    }

    if (transformer.options.includes('outside')) {
      out = out.trim()
    }

    return out
  }

  #transformRegex(value: unknown, transformer: S.RegexTransformer): string {
    if (typeof value !== 'string') {
      throw new Error(`Invalid value: ${value}`)
    }

    const regex = new RegExp(transformer.regex)
    if (!transformer.replacement) {
      const matched = value.match(regex)?.[1]
      if (!matched) {
        throw new Error('Regex did not match')
      }
      return matched
    }

    return value.replace(regex, transformer.replacement)
  }

  #transformCast(value: unknown, transformer: S.CastTransformer): unknown {
    if (transformer.type === 'url') {
      if (typeof value !== 'string') {
        throw new Error(`Invalid URL: ${value}`)
      }
      try {
        return new URL(value).toString()
      } catch (e) {
        return new URL(value, `https://${this.resource.hostname}`).toString()
      }
    } else if (transformer.type === 'number') {
      if (typeof value === 'number') {
        return value
      }
      if (typeof value === 'string') {
        if (!this.numberParser) {
          throw new Error(
            'this.numberParser is undefined. This should never happen',
          )
        }
        const numberParser = transformer.options?.force_locale
          ? new NumberParser(transformer.options.force_locale)
          : this.numberParser
        return numberParser.parse(value)
      }

      throw new Error(`Invalid number: ${value}`)
    }
  }

  #transformFallback(
    value: unknown,
    transformer: S.FallbackTransformer,
  ): unknown {
    if (value === null || value === undefined) {
      return transformer.value
    }
    return value
  }

  #mutateSubObjects(
    key: string,
    object: Record<string, unknown>,
    value: unknown,
  ): Record<string, unknown> {
    const fields = key.split('.')
    if (fields.length === 1) {
      object[key] = value
      return object
    }
    const init = fields.slice(0, -1)
    const last = fields.at(-1) as string
    // biome-ignore lint/suspicious/noExplicitAny: <explanation>
    let target: Record<string, any> = object

    for (const section of init) {
      if (!(section in target)) {
        // biome-ignore lint/suspicious/noExplicitAny: <explanation>
        target[section] = {} as Record<string, any>
      }
      target = target[section]
    }
    target[last] = value
    return object
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

    for (const script of clone.querySelectorAll('style')) {
      script.remove()
    }
    return clone
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
