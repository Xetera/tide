import { DOMParser as ProseDOMParser } from 'prosemirror-model'
import { schema as basicSchema } from 'prosemirror-schema-basic'
import type { Node as ProseMirrorNode } from 'prosemirror-model'
import type { HtmlegyProvider, PipeArg } from '@tide/htmlegy'

const BLOCK_TAGS = new Set([
  'address',
  'article',
  'aside',
  'blockquote',
  'br',
  'div',
  'dl',
  'dt',
  'dd',
  'fieldset',
  'figcaption',
  'figure',
  'footer',
  'form',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'header',
  'hr',
  'li',
  'main',
  'nav',
  'ol',
  'p',
  'pre',
  'section',
  'table',
  'tr',
  'ul',
])

function collectLines(node: Node, out: string[]): void {
  if (node.nodeType === 3) {
    out.push(node.nodeValue ?? '')
    return
  }
  if (node.nodeType !== 1) {
    return
  }
  const el = node as Element
  const tag = el.tagName.toLowerCase()
  const isBlock = BLOCK_TAGS.has(tag)
  if (isBlock) {
    out.push('\n')
  }
  for (const child of Array.from(node.childNodes)) {
    collectLines(child, out)
  }
  if (isBlock) {
    out.push('\n')
  }
}

function linesFor(node: Element): string[] {
  const parts: string[] = []
  collectLines(node, parts)
  return parts
    .join('')
    .split('\n')
    .map((line) => line.replace(/[ \t]+/g, ' ').trim())
    .filter((line) => line.length > 0)
}

function inferMediaType(url: string): 'image' | 'video' | 'media' {
  const ext = url.split('?')[0]!.split('.').pop()?.toLowerCase() ?? ''
  if (ext === 'mp4' || ext === 'webm' || ext === 'mov' || ext === 'ogg') {
    return 'video'
  }
  if (
    ext === 'jpg' ||
    ext === 'jpeg' ||
    ext === 'png' ||
    ext === 'gif' ||
    ext === 'webp' ||
    ext === 'avif' ||
    ext === 'svg'
  ) {
    return 'image'
  }
  return 'media'
}

function mediaOp(
  forcedType: 'image' | 'video' | null,
): (node: Element, _args: PipeArg[], _locale: string) => unknown {
  return (node) => {
    if (!node) {
      return null
    }
    const url = node.getAttribute('src') ?? ''
    const type = forcedType ?? inferMediaType(url)
    const result: Record<string, unknown> = { _type: type, url }
    const w = node.getAttribute('width')
    const h = node.getAttribute('height')
    if (w && h) {
      result['dimensions'] = { width: parseInt(w, 10), height: parseInt(h, 10) }
    }
    return result
  }
}

export const domProvider: HtmlegyProvider<Element> = {
  querySelector: (node, selector) => node.querySelector(selector),
  querySelectorAll: (node, selector) =>
    Array.from(node.querySelectorAll(selector)),

  getContextHtml(node) {
    const snippet = (node.cloneNode(false) as Element).outerHTML
    return snippet.length > 200 ? snippet.slice(0, 197) + '...' : snippet
  },

  getTagName: (node) => node.tagName.toLowerCase(),

  getText: (node) => node.textContent,
  getInnerText: (node) => {
    const t = (node as HTMLElement).innerText
    return t != null ? t : node.textContent
  },
  getTextContent: (node) => node.textContent,
  getLines: (node) => linesFor(node),
  getAttribute: (node, name) => node.getAttribute(name),

  resolveUrl(url) {
    try {
      return new URL(url, location.href).href
    } catch {
      return url
    }
  },

  watch(node, selector, cb) {
    let timer: ReturnType<typeof setTimeout> | null = null
    const debounced = () => {
      if (timer !== null) {
        return
      }
      timer = setTimeout(() => {
        timer = null
        cb()
      }, 50)
    }
    const observer = new MutationObserver(debounced)
    observer.observe(node, {
      childList: true,
      subtree: true,
      attributes: true,
      characterData: true,
    })
    return () => {
      if (timer !== null) {
        clearTimeout(timer)
        timer = null
      }
      observer.disconnect()
    }
  },

  await(node, condition, cb) {
    const check = () => {
      if (!condition || node.querySelector(condition)) {
        observer.disconnect()
        cb(node)
      }
    }
    const observer = new MutationObserver(check)
    observer.observe(node, { childList: true, subtree: true, attributes: true })
    check()
    return () => observer.disconnect()
  },

  pipeOps: {
    ref(value: Element, _args: PipeArg[], _locale: string): unknown {
      return value == null ? null : { _type: 'ref', _id: String(value) }
    },
    media: mediaOp(null),
    image: mediaOp('image'),
    video: mediaOp('video'),
    rich_text(
      node: Element,
      _args: PipeArg[],
      _locale: string,
    ): {
      _type: 'rich_text'
      content: ReturnType<ProseMirrorNode['toJSON']>
    } | null {
      if (!node) {
        return null
      }
      const parser = ProseDOMParser.fromSchema(basicSchema)
      const doc = parser.parse(node)
      return { _type: 'rich_text', content: doc.toJSON() }
    },
  },
}
