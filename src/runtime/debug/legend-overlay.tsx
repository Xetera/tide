import { createResource, createSignal, For } from 'solid-js'
import { render } from 'solid-js/web'
import { sendMessage } from 'webext-bridge/content-script'
import { Storage } from '~/shared/storage'
import type { BrowserStorageSchema } from '~/shared/storage'
import type { Funnel } from '~/funnels/types'
import {
  getRecording,
  isRecordingFor,
  onRecordingChanged,
  setRecording,
  type RecordingValue,
} from '~/shared/recording'

const legendStorage = new Storage<BrowserStorageSchema>()

const LEGEND_TAG = `x-${Math.random().toString(36).slice(2, 9)}`

export function isDarkMode(): boolean {
  return window.matchMedia('(prefers-color-scheme: dark)').matches
}

export function strokeColor(hue: number): string {
  return isDarkMode()
    ? `oklch(0.75 0.2 ${hue} / 0.35)`
    : `oklch(0.55 0.25 ${hue} / 0.5)`
}

export function labelBg(hue: number): string {
  return isDarkMode()
    ? `oklch(0.3 0.15 ${hue} / 0.9)`
    : `oklch(0.92 0.08 ${hue} / 0.9)`
}

export function labelFg(hue: number): string {
  return isDarkMode() ? `oklch(0.9 0.1 ${hue})` : `oklch(0.25 0.15 ${hue})`
}

const LEGEND_CSS = `
  * { box-sizing: border-box; margin: 0; padding: 0; }
  :host { display: block; font: 10px monospace; }
  .legend {
    background: light-dark(oklch(0.97 0 0), oklch(0.18 0 0));
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
  .rows { padding: 4px 0; display: flex; flex-direction: column; gap: 2px; }
  .legend.collapsed .rows { display: none; }
  .row {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 2px 8px;
    border-radius: 0;
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
  .playground-btn {
    background: none; border: none; padding: 0 2px; cursor: pointer;
    color: light-dark(oklch(0.45 0 0), oklch(0.6 0 0)); font: 10px monospace;
    line-height: 1; display: flex; align-items: center;
  }
  .playground-btn:hover { color: light-dark(oklch(0.2 0 0), oklch(0.9 0 0)); }
  .record-btn {
    background: none; border: none; padding: 0 2px; cursor: pointer;
    color: light-dark(oklch(0.45 0 0), oklch(0.6 0 0));
    line-height: 1; display: flex; align-items: center;
  }
  .record-btn:hover { color: light-dark(oklch(0.2 0 0), oklch(0.9 0 0)); }
  .record-dot {
    display: block; width: 8px; height: 8px; border-radius: 50%;
    background: light-dark(oklch(0.5 0 0 / 0.4), oklch(0.6 0 0 / 0.5));
    box-shadow: 0 0 0 1px light-dark(oklch(0.5 0 0 / 0.5), oklch(0.6 0 0 / 0.6)) inset;
  }
  .record-btn.recording .record-dot {
    background: oklch(0.6 0.22 25);
    box-shadow: 0 0 6px oklch(0.6 0.22 25 / 0.7);
    animation: tide-record-pulse 1.4s ease-in-out infinite;
  }
  @keyframes tide-record-pulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.55; }
  }
  .files-dropdown {
    border-top: 1px solid light-dark(oklch(0.75 0 0 / 0.4), oklch(0.4 0 0 / 0.4));
    padding: 0 0 4px; display: flex; flex-direction: column; gap: 2px;
  }
  .legend.collapsed .files-dropdown { display: none; }
  .file-link {
    display: flex; align-items: center; gap: 4px; padding: 2px 6px;
    border-radius: 0; cursor: pointer;
    color: light-dark(oklch(0.3 0 0), oklch(0.8 0 0));
  }
  .file-link:hover { background: light-dark(oklch(0.88 0 0 / 0.6), oklch(0.28 0 0 / 0.6)); border-radius: 0; }
  .file-ext { font-size: 8px; font-weight: 600; }
  .file-ext-html { color: oklch(0.65 0.15 50); }
  .file-ext-json { color: oklch(0.6 0.15 250); }
  .file-count { margin-left: auto; font-size: 9px; color: oklch(0.55 0 0); }
  .file-count.empty { opacity: 0.35; }
  .file-link.unfired { opacity: 0.4; }
  .file-link.active { font-weight: 600; }
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
  .not-opted-in {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 6px;
    padding: 4px 8px;
    font-size: 9px;
    color: light-dark(oklch(0.45 0 0), oklch(0.6 0 0));
    border-top: 1px solid light-dark(oklch(0.75 0 0 / 0.3), oklch(0.4 0 0 / 0.3));
  }
  .legend.collapsed .not-opted-in { display: none; }
  .opt-in-btn {
    background: none;
    border: 1px solid light-dark(oklch(0.65 0 0 / 0.5), oklch(0.45 0 0 / 0.5));
    border-radius: 3px;
    padding: 1px 5px;
    cursor: pointer;
    color: light-dark(oklch(0.35 0 0), oklch(0.75 0 0));
    font: 9px monospace;
    line-height: 1.4;
    white-space: nowrap;
  }
  .opt-in-btn:hover {
    background: light-dark(oklch(0.88 0 0 / 0.6), oklch(0.28 0 0 / 0.6));
    border-color: light-dark(oklch(0.5 0 0 / 0.6), oklch(0.55 0 0 / 0.6));
  }
`

export function openInPlayground(loader: Funnel): void {
  const url = chrome.runtime.getURL(
    `views/playground.html?funnel=${encodeURIComponent(loader.path)}`,
  )
  sendMessage('open-tab', { url }, { context: 'background', tabId: 0 }).catch(
    (err) => console.error('[tide] open-tab failed', err),
  )
}

export interface LegendEntry {
  entity: string
  hue: number
  count: number
}

function FunnelRow(props: {
  file: Funnel
  patchCount: () => number | undefined
  activeOpacity: () => number | null
}) {
  return (
    <div
      class={`file-link${props.activeOpacity() !== null ? ' active' : ''}${props.patchCount() === undefined ? ' unfired' : ''}`}
      style={
        props.activeOpacity() !== null
          ? {
              background: `light-dark(oklch(0.88 0.04 250 / ${props.activeOpacity()! * 0.6}), oklch(0.28 0.04 250 / ${props.activeOpacity()! * 0.6}))`,
            }
          : {}
      }
      on:mousedown={(e: MouseEvent) => e.stopPropagation()}
      on:click={(e: MouseEvent) => {
        e.stopPropagation()
        openInPlayground(props.file)
      }}
    >
      <span
        class={`file-ext ${props.file.format === 'htmlegy' ? 'file-ext-html' : 'file-ext-json'}`}
      >
        {props.file.format === 'htmlegy' ? '</>' : '{}'}
      </span>
      <span
        style={
          props.activeOpacity() !== null
            ? { opacity: String(0.4 + props.activeOpacity()! * 0.6) }
            : {}
        }
      >
        {props.file.file}
      </span>
      {props.patchCount() !== undefined && (
        <span class={`file-count${props.patchCount() === 0 ? ' empty' : ''}`}>
          {props.patchCount()}
        </span>
      )}
    </div>
  )
}

interface FileSignals {
  patchCount: () => number | undefined
  activeOpacity: () => number | null
}

function LegendComponent(props: {
  host: HTMLElement
  entries: () => LegendEntry[]
  errors: () => string[]
  networkFunnels: () => Funnel[]
  fileSignals: (key: string) => FileSignals
  onOpenNetworkFiles: (setter: (v: boolean) => void) => void
  onHiddenChange: (hidden: Set<string>) => void
  onOpacityChange: (v: number) => void
  recording: () => boolean
  toggleRecording: () => void
  isOptedIn: () => boolean
  onOptIn: () => void
}) {
  const [hidden, setHidden] = createSignal(new Set<string>(), { equals: false })
  const [opacity, setOpacity] = createSignal(1)
  const [collapsed, setCollapsed] = createSignal(false)
  const [filesOpen, setFilesOpen] = createSignal(false)
  let userClosed = false
  props.onOpenNetworkFiles((v) => {
    if (!userClosed) {
      setFilesOpen(v)
    }
  })

  createResource(async () => {
    const [savedOpacity, hiddenList, savedCollapsed] = await Promise.all([
      legendStorage.get('legend:opacity', 1),
      legendStorage.get('legend:hidden', [] as string[]),
      legendStorage.get('legend:collapsed', false),
    ])
    const initialHidden = new Set(hiddenList)
    setHidden(initialHidden)
    props.onHiddenChange(initialHidden)
    setCollapsed(savedCollapsed ?? false)
    setOpacity(savedOpacity ?? 1)
    props.onOpacityChange(savedOpacity ?? 1)
  })
  const [dragging, setDragging] = createSignal(false)

  let saveOpacityTimer = 0

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
    const r = props.host.getBoundingClientRect()
    void legendStorage.set('legend:position', { x: r.left, y: r.top })
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

  const moveDrag = (
    clientX: number,
    clientY: number,
    offsetX: number,
    offsetY: number,
    width: number,
    height: number,
  ) => {
    const x = Math.max(
      0,
      Math.min(window.innerWidth - width, clientX - offsetX),
    )
    const y = Math.max(
      0,
      Math.min(window.innerHeight - height, clientY - offsetY),
    )
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
    const { offsetX, offsetY, width, height } = startDrag(
      touch.clientX,
      touch.clientY,
    )
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
    <div
      class={`legend${collapsed() ? ' collapsed' : ''}${dragging() ? ' dragging' : ''}`}
    >
      <div
        class='handle'
        on:mousedown={onDragStart}
        on:touchstart={onTouchStart}
      >
        <span class='handle-title'>Tide</span>
        <div class='handle-dots'>
          <span>
            <i />
            <i />
            <i />
          </span>
          <span>
            <i />
            <i />
            <i />
          </span>
        </div>
        <button
          class={`record-btn${props.recording() ? ' recording' : ''}`}
          on:mousedown={(e: MouseEvent) => e.stopPropagation()}
          on:click={(e: MouseEvent) => {
            e.stopPropagation()
            props.toggleRecording()
          }}
          title={
            props.recording()
              ? 'Stop recording network requests'
              : 'Record network requests on this hostname'
          }
        >
          <span class='record-dot' />
        </button>
        <button
          class='playground-btn'
          on:mousedown={(e: MouseEvent) => e.stopPropagation()}
          on:click={(e: MouseEvent) => {
            e.stopPropagation()
            const url = chrome.runtime.getURL('views/playground.html')
            sendMessage('open-tab', { url }, { context: 'background', tabId: 0 }).catch(
              (err) => console.error('[tide] open-tab failed', err),
            )
          }}
          title='Open playground'
        >
          {'▶'}
        </button>
        {props.networkFunnels().length > 0 && (
          <button
            class='files-btn'
            on:mousedown={(e: MouseEvent) => e.stopPropagation()}
            on:click={(e: MouseEvent) => {
              e.stopPropagation()
              setFilesOpen((v) => {
                userClosed = v
                return !v
              })
            }}
            title='Matching network funnels'
          >
            {'{ }'}
          </button>
        )}
        <button
          class='collapse-btn'
          on:click={(e: MouseEvent) => {
            e.stopPropagation()
            setCollapsed((c) => {
              void legendStorage.set('legend:collapsed', !c)
              return !c
            })
          }}
        >
          {collapsed() ? '▾' : '▴'}
        </button>
      </div>
      <div class='rows'>
        <For each={props.entries()}>
          {({ entity, hue, count }) => (
            <div
              class={`row${hidden().has(entity) ? ' hidden' : ''}`}
              on:click={(e: MouseEvent) => {
                e.stopPropagation()
                toggle(entity)
              }}
            >
              <div class='swatch' style={{ background: strokeColor(hue) }} />
              <span class='entity'>{entity}</span>
              <span class='count'>{count}</span>
            </div>
          )}
        </For>
        {props.entries().length > 0 && (
          <div class='opacity-row'>
            <span class='opacity-label'>opacity</span>
            <input
              type='range'
              class='opacity-slider'
              min='0'
              max='1'
              step='0.05'
              value={opacity()}
              on:input={(e: InputEvent) =>
                changeOpacity(parseFloat((e.target as HTMLInputElement).value))
              }
            />
          </div>
        )}
      </div>
      {props.errors().length > 0 && (
        <div class='errors'>
          <For each={props.errors()}>
            {(err) => <div class='error'>{err}</div>}
          </For>
        </div>
      )}
      {!props.isOptedIn() && (
        <div class='not-opted-in'>
          <span>not opted in</span>
          <button
            class='opt-in-btn'
            on:mousedown={(e: MouseEvent) => e.stopPropagation()}
            on:click={(e: MouseEvent) => {
              e.stopPropagation()
              props.onOptIn()
            }}
          >
            opt in
          </button>
        </div>
      )}
      {filesOpen() && props.networkFunnels().length > 0 && (
        <div class='files-dropdown'>
          <For each={props.networkFunnels()}>
            {(file) => {
              const signals = props.fileSignals(file.key)
              return (
                <FunnelRow
                  file={file}
                  patchCount={signals.patchCount}
                  activeOpacity={signals.activeOpacity}
                />
              )
            }}
          </For>
        </div>
      )}
    </div>
  )
}

interface FileState {
  patchCount: () => number | undefined
  setPatchCount: (v: number | undefined) => void
  activeOpacity: () => number | null
  setActiveOpacity: (v: number | null) => void
}

export class LegendOverlay {
  #host: HTMLElement | null = null
  #mountingPromise: Promise<void> | null = null
  #dispose: (() => void) | null = null
  #hidden = new Set<string>()
  #opacity = 1
  #onRedraw: (() => void) | null = null
  #setEntries: ((v: LegendEntry[]) => void) | null = null
  #setErrors: ((v: string[]) => void) | null = null
  #setNetworkFunnels: ((v: Funnel[]) => void) | null = null
  #openNetworkFiles: ((v: boolean) => void) | null = null
  #unsubscribeRecording: (() => void) | null = null
  #networkFunnels: Funnel[] = []
  #fileStates = new Map<string, FileState>()
  #recentFunnels: string[] = []
  #isOptedIn: boolean
  #setIsOptedIn: ((v: boolean) => void) | null = null
  #onOptIn: () => void
  static readonly #BUFFER_SIZE = 3

  constructor(isOptedIn: boolean, onOptIn: () => void) {
    this.#isOptedIn = isOptedIn
    this.#onOptIn = onOptIn
  }

  setOptedIn(value: boolean): void {
    this.#isOptedIn = value
    this.#setIsOptedIn?.(value)
  }

  set onRedraw(cb: () => void) {
    this.#onRedraw = cb
  }

  mount(): Promise<void> {
    if (this.#host) {
      return Promise.resolve()
    }
    if (this.#mountingPromise) {
      return this.#mountingPromise
    }
    this.#mountingPromise = this.#doMount()
    return this.#mountingPromise
  }

  async #doMount(): Promise<void> {
    const savedPos = await legendStorage.get(
      'legend:position',
      null as { x: number; y: number } | null,
    )
    if (this.#host || !this.#mountingPromise) {
      return
    }
    const left = savedPos ? Math.min(savedPos.x, window.innerWidth - 24) : 12
    const top = savedPos ? Math.min(savedPos.y, window.innerHeight - 24) : 12
    const host = document.createElement(LEGEND_TAG)
    host.style.cssText = `
      position: fixed !important;
      top: ${top}px !important;
      left: ${left}px !important;
      width: fit-content !important;
      z-index: 2147483647 !important;
      pointer-events: auto !important;
    `
    const shadow = host.attachShadow({ mode: 'closed' })
    const styleEl = document.createElement('style')
    styleEl.textContent = LEGEND_CSS
    shadow.appendChild(styleEl)
    const container = document.createElement('div')
    shadow.appendChild(container)

    const [entries, setEntries] = createSignal<LegendEntry[]>([])
    const [errors, setErrors] = createSignal<string[]>([])
    const [networkFunnels, setNetworkFunnels] = createSignal<Funnel[]>(
      this.#networkFunnels,
    )
    const pageHostname = window.location.hostname
    const [recordingState, setRecordingState] =
      createSignal<RecordingValue>(null)
    void getRecording().then(setRecordingState)
    const unsubscribeRecording = onRecordingChanged(setRecordingState)
    const [isOptedIn, setIsOptedIn] = createSignal(this.#isOptedIn)
    this.#setEntries = setEntries
    this.#setErrors = setErrors
    this.#setNetworkFunnels = setNetworkFunnels
    this.#setIsOptedIn = setIsOptedIn
    this.#unsubscribeRecording = unsubscribeRecording

    this.#dispose = render(
      () => (
        <LegendComponent
          host={host}
          entries={entries}
          errors={errors}
          networkFunnels={networkFunnels}
          fileSignals={(key) => this.#getOrCreateFileState(key)}
          onOpenNetworkFiles={(setter) => {
            this.#openNetworkFiles = setter
          }}
          onHiddenChange={(hidden) => {
            this.#hidden = hidden
            this.#onRedraw?.()
          }}
          onOpacityChange={(v) => {
            this.#opacity = v
            this.#onRedraw?.()
          }}
          recording={() => isRecordingFor(recordingState(), pageHostname)}
          toggleRecording={() => {
            const next = !isRecordingFor(recordingState(), pageHostname)
            void setRecording({ hostname: pageHostname, enabled: next })
          }}
          isOptedIn={isOptedIn}
          onOptIn={this.#onOptIn}
        />
      ),
      container,
    )

    this.#host = host
    document.documentElement.appendChild(host)
  }

  #getOrCreateFileState(key: string): FileState {
    const existing = this.#fileStates.get(key)
    if (existing) {
      return existing
    }
    const [patchCount, setPatchCount] = createSignal<number | undefined>(
      undefined,
    )
    const idx = this.#recentFunnels.indexOf(key)
    const initialOpacity = idx === -1 ? null : Math.pow(0.55, idx)
    const [activeOpacity, setActiveOpacity] = createSignal<number | null>(
      initialOpacity,
    )
    const state: FileState = {
      patchCount,
      setPatchCount,
      activeOpacity,
      setActiveOpacity,
    }
    this.#fileStates.set(key, state)
    return state
  }

  unmount() {
    this.#dispose?.()
    this.#host?.remove()
    this.#host = null
    this.#mountingPromise = null
    this.#dispose = null
    this.#setEntries = null
    this.#setErrors = null
    this.#setNetworkFunnels = null
    this.#setIsOptedIn = null
    this.#openNetworkFiles = null
    this.#unsubscribeRecording?.()
    this.#unsubscribeRecording = null
    this.#hidden = new Set()
    this.#opacity = 1
    this.#fileStates = new Map()
    this.#recentFunnels = []
  }

  setNetworkFunnels(files: Funnel[]): void {
    this.#networkFunnels = files
    this.#setNetworkFunnels?.(files)
  }

  recordResult(key: string, count: number): void {
    const state = this.#fileStates.get(key)
    if (!state) {
      return
    }
    const prev = state.patchCount() ?? 0
    state.setPatchCount(prev + count)
  }

  setActiveFunnel(key: string | null): void {
    if (key === null) {
      return
    }
    if (this.#recentFunnels[0] === key) {
      return
    }
    this.#recentFunnels = [
      key,
      ...this.#recentFunnels.filter((k) => k !== key),
    ].slice(0, LegendOverlay.#BUFFER_SIZE)
    this.#applyFunnelOpacities()
  }

  #applyFunnelOpacities(): void {
    for (const [k, state] of this.#fileStates) {
      const idx = this.#recentFunnels.indexOf(k)
      if (idx === -1) {
        state.setActiveOpacity(null)
      } else {
        const opacity = Math.pow(0.55, idx)
        state.setActiveOpacity(opacity)
      }
    }
  }

  resetFileStates(): void {
    this.#recentFunnels = []
    for (const state of this.#fileStates.values()) {
      state.setPatchCount(undefined)
      state.setActiveOpacity(null)
    }
  }

  isHidden(entity: string) {
    return this.#hidden.has(entity)
  }

  get opacity() {
    return this.#opacity
  }

  update(
    hues: Map<string, number>,
    counts: Map<string, number>,
    errors: string[] = [],
  ) {
    this.#setErrors?.(errors)
    this.#setEntries?.(
      Array.from(hues.entries()).map(([entity, hue]) => ({
        entity,
        hue,
        count: counts.get(entity) ?? 0,
      })),
    )
  }

  openNetworkFiles() {
    this.#openNetworkFiles?.(true)
  }
}
