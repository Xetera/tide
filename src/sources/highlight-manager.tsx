import { createResource, createSignal, For } from 'solid-js'
import { render } from 'solid-js/web'
import { sendMessage } from 'webext-bridge/content-script'
import type { HighlightEntry } from '~/extraction/html-parser'
import { Storage } from '~/shared/storage'
import type { BrowserStorageSchema } from '~/shared/storage'

const legendStorage = new Storage<BrowserStorageSchema>()

const CANVAS_ID = 'spatula-highlight-canvas'
const LEGEND_TAG = `x-${Math.random().toString(36).slice(2, 9)}`
const HUE_STEP = 37

function rectsOverlap(a: DOMRect, b: DOMRect): boolean {
  return (
    a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top
  )
}

function hueFor(entity: string, hues: Map<string, number>): number {
  if (!entity) {
    return 0
  }
  if (!hues.has(entity)) {
    hues.set(entity, (hues.size * HUE_STEP) % 360)
  }
  return hues.get(entity)!
}

function isDarkMode(): boolean {
  return window.matchMedia('(prefers-color-scheme: dark)').matches
}

function strokeColor(hue: number): string {
  return isDarkMode()
    ? `oklch(0.75 0.2 ${hue} / 0.35)`
    : `oklch(0.55 0.25 ${hue} / 0.5)`
}

function labelBg(hue: number): string {
  return isDarkMode()
    ? `oklch(0.3 0.15 ${hue} / 0.9)`
    : `oklch(0.92 0.08 ${hue} / 0.9)`
}

function labelFg(hue: number): string {
  return isDarkMode() ? `oklch(0.9 0.1 ${hue})` : `oklch(0.25 0.15 ${hue})`
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

const LEGEND_CSS = `
  * { box-sizing: border-box; margin: 0; padding: 0; }
  :host { display: block; font: 10px monospace; }
  .legend {
    background: light-dark(oklch(0.97 0 0 / 0.95), oklch(0.18 0 0 / 0.9));
    border: 1px solid light-dark(oklch(0.75 0 0 / 0.5), oklch(0.4 0 0 / 0.5));
    border-radius: 6px;
    overflow: hidden;
    display: flex;
    flex-direction: column;
    min-width: 120px;
    max-width: calc(100vw - 24px);
    box-shadow: 0 2px 8px oklch(0 0 0 / 0.15);
    touch-action: none;
  }
  .handle {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 6px;
    padding: 5px 8px;
    background: light-dark(oklch(0.91 0 0 / 0.8), oklch(0.24 0 0 / 0.8));
    border-bottom: 1px solid light-dark(oklch(0.75 0 0 / 0.4), oklch(0.4 0 0 / 0.4));
    cursor: grab;
    user-select: none;
  }
  .legend.collapsed .handle { border-bottom: none; }
  .legend.dragging .handle { cursor: grabbing; }
  .collapse-btn {
    background: none;
    border: none;
    padding: 0 2px;
    cursor: pointer;
    color: light-dark(oklch(0.45 0 0), oklch(0.6 0 0));
    font: 10px monospace;
    line-height: 1;
    display: flex;
    align-items: center;
  }
  .collapse-btn:hover { color: light-dark(oklch(0.2 0 0), oklch(0.9 0 0)); }
  .handle-title {
    font: 600 10px monospace;
    color: light-dark(oklch(0.35 0 0), oklch(0.7 0 0));
    letter-spacing: 0.03em;
  }
  .handle-dots {
    display: flex;
    flex-direction: column;
    gap: 2px;
    opacity: 0.4;
    flex: 1;
  }
  .handle-dots span { display: flex; gap: 2px; }
  .handle-dots i {
    display: block;
    width: 2px;
    height: 2px;
    border-radius: 50%;
    background: light-dark(oklch(0.3 0 0), oklch(0.8 0 0));
  }
  .rows { padding: 6px; display: flex; flex-direction: column; gap: 2px; }
  .legend.collapsed .rows { display: none; }
  .row {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 2px 4px;
    border-radius: 3px;
    cursor: pointer;
    user-select: none;
    transition: background 0.1s;
  }
  .row:hover { background: light-dark(oklch(0.88 0 0 / 0.6), oklch(0.28 0 0 / 0.6)); }
  .row.hidden { opacity: 0.4; }
  .swatch { width: 10px; height: 10px; border-radius: 2px; flex-shrink: 0; }
  .entity { color: light-dark(oklch(0.2 0 0), oklch(0.9 0 0)); flex: 1; }
  .row.hidden .entity { text-decoration: line-through; }
  .count { color: oklch(0.55 0 0); }
  .errors { padding: 4px 6px; display: flex; flex-direction: column; gap: 2px; border-top: 1px solid light-dark(oklch(0.75 0 0 / 0.3), oklch(0.4 0 0 / 0.3)); }
  .legend.collapsed .errors { display: none; }
  .error { color: oklch(0.55 0.2 25); font-size: 9px; word-break: break-all; }
  .files-btn {
    background: none; border: none; padding: 0 2px; cursor: pointer;
    color: light-dark(oklch(0.45 0 0), oklch(0.6 0 0)); font: 10px monospace;
    line-height: 1; display: flex; align-items: center;
  }
  .files-btn:hover { color: light-dark(oklch(0.2 0 0), oklch(0.9 0 0)); }
  .files-dropdown {
    border-top: 1px solid light-dark(oklch(0.75 0 0 / 0.4), oklch(0.4 0 0 / 0.4));
    padding: 4px 6px; display: flex; flex-direction: column; gap: 2px;
  }
  .legend.collapsed .files-dropdown { display: none; }
  .file-link {
    display: flex; align-items: center; gap: 4px; padding: 2px 2px;
    border-radius: 3px; cursor: pointer; text-decoration: none;
    color: light-dark(oklch(0.3 0 0), oklch(0.8 0 0));
  }
  .file-link:hover { background: light-dark(oklch(0.88 0 0 / 0.6), oklch(0.28 0 0 / 0.6)); }
  .file-ext { font-size: 8px; font-weight: 600; }
  .file-ext-html { color: oklch(0.65 0.15 50); }
  .file-ext-json { color: oklch(0.6 0.15 250); }
  .opacity-row {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 4px 4px 2px;
    border-top: 1px solid light-dark(oklch(0.75 0 0 / 0.3), oklch(0.4 0 0 / 0.3));
    margin-top: 2px;
  }
  .opacity-label { color: light-dark(oklch(0.45 0 0), oklch(0.6 0 0)); white-space: nowrap; }
  .opacity-slider {
    flex: 1;
    accent-color: light-dark(oklch(0.45 0.15 250), oklch(0.65 0.15 250));
    cursor: pointer;
    height: 3px;
  }
`

function LegendComponent(props: {
  host: HTMLElement
  entries: () => Array<{ entity: string; hue: number; count: number }>
  errors: () => string[]
  loaderFiles: () => Array<{ name: string; path: string; format: string }>
  onHiddenChange: (hidden: Set<string>) => void
  onOpacityChange: (v: number) => void
}) {
  const [hidden, setHidden] = createSignal(new Set<string>(), { equals: false })
  const [opacity, setOpacity] = createSignal(1)
  const [collapsed, setCollapsed] = createSignal(false)
  const [filesOpen, setFilesOpen] = createSignal(false)

  const [savedPrefs] = createResource(async () => {
    const [pos, savedOpacity, hiddenList, savedCollapsed] = await Promise.all([
      legendStorage.get('legend:position', null as { x: number; y: number } | null),
      legendStorage.get('legend:opacity', 1),
      legendStorage.get('legend:hidden', [] as string[]),
      legendStorage.get('legend:collapsed', false),
    ])
    if (pos) {
      const x = Math.min(pos.x, window.innerWidth - 24)
      const y = Math.min(pos.y, window.innerHeight - 24)
      props.host.style.setProperty('left', `${x}px`, 'important')
      props.host.style.setProperty('top', `${y}px`, 'important')
      props.host.style.setProperty('right', 'auto', 'important')
    }
    const initialHidden = new Set(hiddenList)
    setHidden(initialHidden)
    props.onHiddenChange(initialHidden)
    setCollapsed(savedCollapsed)
    return { opacity: savedOpacity }
  })
  const [dragging, setDragging] = createSignal(false)

  let savePosTimer = 0
  let saveOpacityTimer = 0

  const resolvedOpacity = () => savedPrefs()?.opacity ?? opacity()

  const toggle = (entity: string) => {
    setHidden((prev) => {
      const next = new Set(prev)
      if (next.has(entity)) {
        next.delete(entity)
      } else {
        next.add(entity)
      }
      props.onHiddenChange(next)
      void legendStorage.set('legend:hidden', Array.from(next))
      return next
    })
  }

  const changeOpacity = (v: number) => {
    setOpacity(v)
    props.onOpacityChange(v)
    clearTimeout(saveOpacityTimer)
    saveOpacityTimer = window.setTimeout(() => {
      void legendStorage.set('legend:opacity', v)
    }, 500)
  }

  const savePosition = () => {
    clearTimeout(savePosTimer)
    savePosTimer = window.setTimeout(() => {
      const r = props.host.getBoundingClientRect()
      void legendStorage.set('legend:position', { x: r.left, y: r.top })
    }, 500)
  }

  const startDrag = (startX: number, startY: number) => {
    const rect = props.host.getBoundingClientRect()
    const offsetX = startX - rect.left
    const offsetY = startY - rect.top
    props.host.style.setProperty('left', `${rect.left}px`, 'important')
    props.host.style.setProperty('top', `${rect.top}px`, 'important')
    props.host.style.setProperty('right', 'auto', 'important')
    setDragging(true)
    return { offsetX, offsetY, width: rect.width, height: rect.height }
  }

  const moveDrag = (clientX: number, clientY: number, offsetX: number, offsetY: number, width: number, height: number) => {
    const x = Math.max(0, Math.min(window.innerWidth - width, clientX - offsetX))
    const y = Math.max(0, Math.min(window.innerHeight - height, clientY - offsetY))
    props.host.style.setProperty('left', `${x}px`, 'important')
    props.host.style.setProperty('top', `${y}px`, 'important')
  }

  const onDragStart = (e: MouseEvent) => {
    if (e.button !== 0) {
      return
    }
    e.preventDefault()
    const { offsetX, offsetY, width, height } = startDrag(e.clientX, e.clientY)

    const onMouseMove = (e: MouseEvent) => {
      moveDrag(e.clientX, e.clientY, offsetX, offsetY, width, height)
    }

    const onMouseUp = () => {
      setDragging(false)
      document.removeEventListener('mousemove', onMouseMove)
      document.removeEventListener('mouseup', onMouseUp)
      savePosition()
    }

    document.addEventListener('mousemove', onMouseMove)
    document.addEventListener('mouseup', onMouseUp)
  }

  const onTouchStart = (e: TouchEvent) => {
    if ((e.target as Element).closest('.collapse-btn')) {
      return
    }
    const touch = e.touches[0]!
    const { offsetX, offsetY, width, height } = startDrag(touch.clientX, touch.clientY)

    const onTouchMove = (e: TouchEvent) => {
      const t = e.touches[0]!
      moveDrag(t.clientX, t.clientY, offsetX, offsetY, width, height)
    }

    const onTouchEnd = () => {
      setDragging(false)
      document.removeEventListener('touchmove', onTouchMove)
      document.removeEventListener('touchend', onTouchEnd)
      savePosition()
    }

    document.addEventListener('touchmove', onTouchMove, { passive: false })
    document.addEventListener('touchend', onTouchEnd)
  }

  return (
    <div class={`legend${collapsed() ? ' collapsed' : ''}${dragging() ? ' dragging' : ''}`}>
      <div class="handle" on:mousedown={onDragStart} on:touchstart={onTouchStart}>
        <span class="handle-title">Spatula</span>
        <div class="handle-dots">
          <span><i /><i /><i /></span>
          <span><i /><i /><i /></span>
        </div>
        {props.loaderFiles().length > 0 && (
          <button class="files-btn" on:mousedown={(e: MouseEvent) => e.stopPropagation()} on:click={(e: MouseEvent) => { e.stopPropagation(); setFilesOpen(v => !v) }} title="Matching loaders">
            {'{ }'}
          </button>
        )}
        <button class="collapse-btn" on:click={(e: MouseEvent) => { e.stopPropagation(); setCollapsed(c => { void legendStorage.set('legend:collapsed', !c); return !c }) }}>
          {collapsed() ? '▾' : '▴'}
        </button>
      </div>
      <div class="rows">
        <For each={props.entries()}>
          {({ entity, hue, count }) => (
            <div
              class={`row${hidden().has(entity) ? ' hidden' : ''}`}
              on:click={(e: MouseEvent) => { e.stopPropagation(); toggle(entity) }}
            >
              <div class="swatch" style={{ background: strokeColor(hue) }} />
              <span class="entity">{entity}</span>
              <span class="count">{count}</span>
            </div>
          )}
        </For>
        {props.entries().length > 0 && (
          <div class="opacity-row">
            <span class="opacity-label">opacity</span>
            <input
              type="range"
              class="opacity-slider"
              min="0"
              max="1"
              step="0.05"
              value={resolvedOpacity()}
              on:input={(e: InputEvent) => changeOpacity(parseFloat((e.target as HTMLInputElement).value))}
            />
          </div>
        )}
      </div>
      {props.errors().length > 0 && (
        <div class="errors">
          <For each={props.errors()}>
            {(err) => <div class="error">{err}</div>}
          </For>
        </div>
      )}
      {filesOpen() && props.loaderFiles().length > 0 && (
        <div class="files-dropdown">
          <For each={props.loaderFiles()}>
            {(file) => (
              <a
                class="file-link"
                href="#"
                on:mousedown={(e: MouseEvent) => e.stopPropagation()}
                on:click={(e: MouseEvent) => {
                  e.preventDefault()
                  const url = chrome.runtime.getURL(`playground.html?loader=${encodeURIComponent(file.path)}`)
                  void sendMessage('open-tab', { url }, { context: 'background', tabId: 0 })
                }}
              >
                <span class={`file-ext ${file.format === 'htmlevate' ? 'file-ext-html' : 'file-ext-json'}`}>
                  {file.format === 'htmlevate' ? '</>' : '{}'}
                </span>
                <span>{file.name}</span>
              </a>
            )}
          </For>
        </div>
      )}
    </div>
  )
}

export class LegendOverlay {
  #host: HTMLElement | null = null
  #dispose: (() => void) | null = null
  #hidden = new Set<string>()
  #opacity = 1
  #onRedraw: (() => void) | null = null
  #setEntries: ((v: Array<{ entity: string; hue: number; count: number }>) => void) | null = null
  #setErrors: ((v: string[]) => void) | null = null
  #setLoaderFiles: ((v: Array<{ name: string; path: string; format: string }>) => void) | null = null

  set onRedraw(cb: () => void) {
    this.#onRedraw = cb
  }

  mount() {
    if (this.#host) {
      return
    }
    const host = document.createElement(LEGEND_TAG)
    host.style.cssText = `
      position: fixed !important;
      top: 12px !important;
      left: 12px !important;
      z-index: 2147483647 !important;
      pointer-events: auto !important;
    `
    const shadow = host.attachShadow({ mode: 'closed' })
    const styleEl = document.createElement('style')
    styleEl.textContent = LEGEND_CSS
    shadow.appendChild(styleEl)
    const container = document.createElement('div')
    shadow.appendChild(container)

    const [entries, setEntries] = createSignal<Array<{ entity: string; hue: number; count: number }>>([])
    const [errors, setErrors] = createSignal<string[]>([])
    const [loaderFiles, setLoaderFiles] = createSignal<Array<{ name: string; path: string; format: string }>>([])
    this.#setEntries = setEntries
    this.#setErrors = setErrors
    this.#setLoaderFiles = setLoaderFiles

    this.#dispose = render(
      () => (
        <LegendComponent
          host={host}
          entries={entries}
          errors={errors}
          loaderFiles={loaderFiles}
          onHiddenChange={(hidden) => { this.#hidden = hidden; this.#onRedraw?.() }}
          onOpacityChange={(v) => { this.#opacity = v; this.#onRedraw?.() }}
        />
      ),
      container,
    )

    this.#host = host
    document.documentElement.appendChild(host)
  }

  unmount() {
    this.#dispose?.()
    this.#host?.remove()
    this.#host = null
    this.#dispose = null
    this.#setEntries = null
    this.#setErrors = null
    this.#setLoaderFiles = null
    this.#hidden = new Set()
    this.#opacity = 1
  }

  isHidden(entity: string) {
    return this.#hidden.has(entity)
  }

  get opacity() {
    return this.#opacity
  }

  update(hues: Map<string, number>, counts: Map<string, number>, errors: string[] = []) {
    this.#setErrors?.(errors)
    this.#setEntries?.(
      Array.from(hues.entries()).map(([entity, hue]) => ({
        entity,
        hue,
        count: counts.get(entity) ?? 0,
      })),
    )
  }

  setLoaderFiles(files: Array<{ name: string; path: string; format: string }>) {
    this.#setLoaderFiles?.(files)
  }
}

export class HighlightManager {
  #active = true
  #entries: readonly HighlightEntry[] = []
  #patchCounts: Map<string, number> | null = null
  #errors: string[] = []
  #loaderFiles: Array<{ name: string; path: string; format: string }> = []
  #hues = new Map<string, number>()
  #canvas: HTMLCanvasElement | null = null
  #raf = 0
  #observer: MutationObserver | null = null
  #listeners: (() => void)[] = []
  #legend = new LegendOverlay()

  setLoaderFiles(files: Array<{ name: string; path: string; format: string }>) {
    this.#loaderFiles = files
    this.#legend.setLoaderFiles(files)
  }

  toggle(entries: readonly HighlightEntry[]) {
    if (this.#active) {
      this.clear()
    } else {
      this.apply(entries)
    }
  }

  apply(entries: readonly HighlightEntry[], patchCounts?: Map<string, number>, errors?: string[]) {
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
    this.#legend.mount()
    this.#legend.setLoaderFiles(this.#loaderFiles)
    this.#legend.onRedraw = () => this.#scheduleDraw()
    this.#scheduleDraw()
    this.#observe()
  }

  clear() {
    this.#active = false
    this.#entries = []
    cancelAnimationFrame(this.#raf)
    this.#canvas?.remove()
    this.#canvas = null
    this.#legend.unmount()
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

    const opacity = this.#legend.opacity
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
      if (this.#legend.isHidden(label.entity)) {
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
        if (!existing.labels.some((l) => l.entity === label.entity && l.field === label.field)) {
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
    this.#legend.update(this.#hues, counts, this.#errors)
  }
}
