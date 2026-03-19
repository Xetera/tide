import type { HighlightEntry } from '~/protocol/html-parser'

const CANVAS_ID = 'spatula-highlight-canvas'
const HUE_STEP = 37

function rectsOverlap(a: DOMRect, b: DOMRect): boolean {
  return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top
}

function hueFor(label: string, hues: Map<string, number>): number {
  const root = label.split('.')[0]
  if (!root) return 0
  if (!hues.has(root)) {
    hues.set(root, (hues.size * HUE_STEP) % 360)
  }
  return hues.get(root)!
}

function oklchToCtx(hue: number): string {
  return `oklch(0.7 0.2 ${hue} / 0.2)`
}

function getComputedBorderRadii(
  element: Element,
  rect: DOMRect,
): [number, number, number, number] {
  const style = getComputedStyle(element)
  const parse = (v: string) => {
    if (v.endsWith('%')) {
      return (parseFloat(v) / 100) * Math.min(rect.width, rect.height)
    }
    return parseFloat(v) || 0
  }
  return [
    parse(style.borderTopLeftRadius),
    parse(style.borderTopRightRadius),
    parse(style.borderBottomRightRadius),
    parse(style.borderBottomLeftRadius),
  ]
}

export class HighlightManager {
  #active = true
  #entries: readonly HighlightEntry[] = []
  #hues = new Map<string, number>()
  #canvas: HTMLCanvasElement | null = null
  #raf = 0

  toggle(entries: readonly HighlightEntry[]) {
    if (this.#active) {
      this.clear()
    } else {
      this.apply(entries)
    }
  }

  apply(entries: readonly HighlightEntry[]) {
    this.clear()
    this.#active = true
    this.#entries = entries
    this.#hues = new Map()
    for (const { label } of entries) {
      hueFor(label, this.#hues)
    }
    this.#ensureCanvas()
    this.#startLoop()
  }

  clear() {
    this.#active = false
    this.#entries = []
    cancelAnimationFrame(this.#raf)
    this.#canvas?.remove()
    this.#canvas = null
  }

  get active() {
    return this.#active
  }

  #ensureCanvas() {
    if (this.#canvas) return
    const canvas = document.createElement('canvas')
    canvas.id = CANVAS_ID
    canvas.style.cssText = `
      position: fixed !important;
      inset: 0 !important;
      width: 100vw !important;
      height: 100vh !important;
      pointer-events: none !important;
      z-index: 2147483647 !important;
    `
    document.documentElement.appendChild(canvas)
    this.#canvas = canvas
  }

  #startLoop() {
    const draw = () => {
      this.#draw()
      this.#raf = requestAnimationFrame(draw)
    }
    this.#raf = requestAnimationFrame(draw)
  }

  #draw() {
    const canvas = this.#canvas
    if (!canvas) return

    const dpr = window.devicePixelRatio || 1
    const w = window.innerWidth
    const h = window.innerHeight

    if (canvas.width !== w * dpr || canvas.height !== h * dpr) {
      canvas.width = w * dpr
      canvas.height = h * dpr
    }

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, w, h)

    const drawn = new Map<
      Element,
      {
        element: Element
        rect: DOMRect
        labels: string[]
        hue: number
        isArrayItem: boolean
      }
    >()

    for (const { element, label, isArrayItem } of this.#entries) {
      const rect = element.getBoundingClientRect()
      if (rect.width === 0 && rect.height === 0) continue
      if (rect.bottom < 0 || rect.top > h || rect.right < 0 || rect.left > w)
        continue

      const hue = this.#hues.get(label.split('.')[0] || '') ?? 0

      const existing = drawn.get(element)
      if (existing) {
        existing.labels.push(label)
      } else {
        drawn.set(element, {
          element,
          rect,
          labels: [label],
          hue,
          isArrayItem: !!isArrayItem,
        })
      }
    }

    const placedLabels: DOMRect[] = []

    for (const { element, rect, labels, hue, isArrayItem } of drawn.values()) {
      const color = oklchToCtx(hue)

      const radii = getComputedBorderRadii(element, rect)

      ctx.strokeStyle = color
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.roundRect(rect.x, rect.y, rect.width, rect.height, radii)
      ctx.stroke()

      if (!isArrayItem) {
        const text = labels.join(', ')
        ctx.font = '9px Menlo, monospace'
        const metrics = ctx.measureText(text)
        const textHeight = 10
        const padding = 3
        const tagW = metrics.width + padding * 2
        const tagH = textHeight + padding * 2

        const candidates = [
          new DOMRect(rect.x, rect.y - tagH - 2, tagW, tagH),
          new DOMRect(rect.x, rect.bottom + 2, tagW, tagH),
          new DOMRect(rect.right + 2, rect.y, tagW, tagH),
          new DOMRect(rect.x - tagW - 2, rect.y, tagW, tagH),
        ]

        const tagRect = candidates.find(
          (c) => !placedLabels.some((p) => rectsOverlap(p, c)),
        ) ?? candidates[0]

        placedLabels.push(tagRect)

        ctx.fillStyle = color
        ctx.fillRect(tagRect.x, tagRect.y, tagRect.width, tagRect.height)

        ctx.fillStyle = `oklch(1 0.15 ${hue})`
        ctx.fillText(text, tagRect.x + padding, tagRect.y + padding + textHeight - 1)
      }
    }
  }
}
