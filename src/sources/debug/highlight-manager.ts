import type { HighlightEntry } from '~/extraction/scrape-result'
import { strokeColor, labelBg, labelFg } from './legend-overlay'

const CANVAS_ID = 'tide-highlight-canvas'
const HUE_STEP = 37

function rectsOverlap(a: DOMRect, b: DOMRect): boolean {
  return (
    a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top
  )
}

export function hueFor(entity: string, hues: Map<string, number>): number {
  if (!entity) {
    return 0
  }
  if (!hues.has(entity)) {
    hues.set(entity, (hues.size * HUE_STEP) % 360)
  }
  return hues.get(entity)!
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

export interface HighlightManagerCallbacks {
  opacity(): number
  isHidden(entity: string): boolean
  onDraw(
    hues: Map<string, number>,
    counts: Map<string, number>,
    errors: string[],
  ): void
}

export class HighlightManager {
  #active = true
  #entries: readonly HighlightEntry[] = []
  #patchCounts: Map<string, number> | null = null
  #errors: string[] = []
  #hues = new Map<string, number>()
  #canvas: HTMLCanvasElement | null = null
  #raf = 0
  #observer: MutationObserver | null = null
  #listeners: (() => void)[] = []
  #callbacks: HighlightManagerCallbacks

  constructor(callbacks: HighlightManagerCallbacks) {
    this.#callbacks = callbacks
  }

  scheduleRedraw() {
    this.#scheduleDraw()
  }

  toggle(entries: readonly HighlightEntry[]) {
    if (this.#active) {
      this.clear()
    } else {
      this.apply(entries)
    }
  }

  apply(
    entries: readonly HighlightEntry[],
    patchCounts?: Map<string, number>,
    errors?: string[],
  ) {
    this.clear()
    this.#active = true
    this.#entries = entries
    this.#patchCounts = patchCounts ?? null
    this.#errors = errors ?? []
    this.#hues = new Map()
    for (const { label } of entries) {
      hueFor(label.entity, this.#hues)
    }
    this.#ensureCanvas()
    this.#scheduleDraw()
    this.#observe()
  }

  clear() {
    this.#active = false
    this.#entries = []
    cancelAnimationFrame(this.#raf)
    this.#canvas?.remove()
    this.#canvas = null
    this.#observer?.disconnect()
    this.#observer = null
    for (const off of this.#listeners) {
      off()
    }
    this.#listeners = []
  }

  get active() {
    return this.#active
  }

  #ensureCanvas() {
    if (this.#canvas) {
      return
    }
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

  #scheduleDraw() {
    cancelAnimationFrame(this.#raf)
    this.#raf = requestAnimationFrame(() => {
      this.#draw()
    })
  }

  #observe() {
    const invalidate = () => this.#scheduleDraw()

    window.addEventListener('scroll', invalidate, {
      capture: true,
      passive: true,
    })
    window.addEventListener('resize', invalidate)
    this.#listeners.push(
      () => window.removeEventListener('scroll', invalidate, { capture: true }),
      () => window.removeEventListener('resize', invalidate),
    )

    this.#observer = new MutationObserver(invalidate)
    this.#observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['style', 'class'],
    })
  }

  #draw() {
    const canvas = this.#canvas
    if (!canvas) {
      return
    }

    const dpr = window.devicePixelRatio || 1
    const w = window.innerWidth
    const h = window.innerHeight

    if (canvas.width !== w * dpr || canvas.height !== h * dpr) {
      canvas.width = w * dpr
      canvas.height = h * dpr
    }

    const ctx = canvas.getContext('2d')
    if (!ctx) {
      return
    }

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, w, h)

    const opacity = this.#callbacks.opacity()
    const drawn = new Map<
      Element,
      {
        element: Element
        rect: DOMRect
        labels: { entity: string; field: string }[]
        hue: number
        isArrayItem: boolean
      }
    >()

    for (const { element, label, isArrayItem } of this.#entries) {
      if (this.#callbacks.isHidden(label.entity)) {
        continue
      }
      const rect = element.getBoundingClientRect()
      if (rect.width === 0 && rect.height === 0) {
        continue
      }
      if (rect.bottom < 0 || rect.top > h || rect.right < 0 || rect.left > w) {
        continue
      }

      const hue = this.#hues.get(label.entity) ?? 0

      const existing = drawn.get(element)
      if (existing) {
        if (
          !existing.labels.some(
            (l) => l.entity === label.entity && l.field === label.field,
          )
        ) {
          existing.labels.push(label)
        }
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

    ctx.globalAlpha = opacity

    for (const { element, rect, labels, hue, isArrayItem } of drawn.values()) {
      const radii = getComputedBorderRadii(element, rect)

      ctx.strokeStyle = strokeColor(hue)
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.roundRect(rect.x, rect.y, rect.width, rect.height, radii)
      ctx.stroke()

      if (!isArrayItem) {
        const text = labels.map((l) => l.field).join(', ')
        ctx.font = '9px monospace'
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

        const tagRect =
          candidates.find(
            (c) => !placedLabels.some((p) => rectsOverlap(p, c)),
          ) ?? candidates[0]!

        placedLabels.push(tagRect)

        ctx.fillStyle = labelBg(hue)
        ctx.fillRect(tagRect.x, tagRect.y, tagRect.width, tagRect.height)

        ctx.fillStyle = labelFg(hue)
        ctx.fillText(
          text,
          tagRect.x + padding,
          tagRect.y + padding + textHeight - 1,
        )
      }
    }

    ctx.globalAlpha = 1

    const counts = new Map<string, number>()
    if (this.#patchCounts) {
      for (const entity of this.#hues.keys()) {
        counts.set(entity, this.#patchCounts.get(entity) ?? 0)
      }
    } else {
      for (const entity of this.#hues.keys()) {
        counts.set(entity, 1)
      }
    }
    this.#callbacks.onDraw(this.#hues, counts, this.#errors)
  }
}
