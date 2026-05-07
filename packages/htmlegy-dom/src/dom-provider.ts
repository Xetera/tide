import type { HtmlegyProvider, PipeArg } from '@tide/htmlegy'

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
  getAttribute: (node, name) => node.getAttribute(name),

  resolveUrl(url) {
    try {
      return new URL(url, location.href).href
    } catch {
      return url
    }
  },

  watch(node, selector, cb) {
    const target = selector
      ? (node.querySelector(selector)?.parentElement ?? node)
      : node
    const observer = new MutationObserver(cb)
    observer.observe(target, {
      childList: true,
      subtree: true,
      attributes: true,
      characterData: true,
    })
    return () => observer.disconnect()
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
    media: mediaOp(null),
    image: mediaOp('image'),
    video: mediaOp('video'),
  },
}
