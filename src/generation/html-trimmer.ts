const REMOVED_TAGS = new Set([
  'script',
  'style',
  'head',
  'noscript',
  'template',
  'iframe',
  'svg',
])

const REMOVED_ATTRS = new Set([
  'style',
  'class',
  'id',
  'tabindex',
  'role',
  'aria-label',
  'aria-hidden',
  'aria-expanded',
  'aria-controls',
  'data-testid',
])

export function trimHtml(html: string): string {
  const parser = new DOMParser()
  const doc = parser.parseFromString(html, 'text/html')

  for (const tag of REMOVED_TAGS) {
    for (const el of doc.querySelectorAll(tag)) {
      el.remove()
    }
  }

  const walker = document.createTreeWalker(doc.body, NodeFilter.SHOW_ELEMENT)
  const elements: Element[] = []
  let node: Node | null = walker.currentNode
  while (node) {
    if (node.nodeType === Node.ELEMENT_NODE) {
      elements.push(node as Element)
    }
    node = walker.nextNode()
  }

  for (const el of elements) {
    for (const attr of REMOVED_ATTRS) {
      el.removeAttribute(attr)
    }
  }

  return (doc.body.innerHTML ?? '').replace(/\s{2,}/g, ' ').trim()
}
