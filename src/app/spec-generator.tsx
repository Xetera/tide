import { For, Show, createSignal, onMount } from 'solid-js'
import { sendMessage } from 'webext-bridge/popup'
import type { CaptureEntry, LoaderMatchResult } from '~/generation/types'

function relativeTime(ts: number): string {
  const diff = Date.now() - ts
  if (diff < 60_000) {
    return `${Math.floor(diff / 1000)}s ago`
  }
  if (diff < 3_600_000) {
    return `${Math.floor(diff / 60_000)}m ago`
  }
  return `${Math.floor(diff / 3_600_000)}h ago`
}

function MatchResult({ result }: { result: LoaderMatchResult }) {
  const label = `${result.loader} / ${result.file}`
  const [open, setOpen] = createSignal(false)

  return (
    <div class='border border-border rounded-md text-xs overflow-hidden'>
      <button
        type='button'
        onClick={() => setOpen((v) => !v)}
        class='w-full flex items-center gap-2 px-2 py-1.5 text-left hover:bg-accent transition-colors'
      >
        <span
          class={`h-1.5 w-1.5 rounded-full shrink-0 ${result.matched ? (result.validationErrors.length > 0 ? 'bg-yellow-500' : 'bg-green-500') : 'bg-muted-foreground'}`}
        />
        <span class='font-mono flex-1'>{label}</span>
        <Show when={result.matched}>
          <span class='text-muted-foreground shrink-0'>
            {
              (result as Extract<LoaderMatchResult, { matched: true }>).patches
                .length
            }{' '}
            patches
          </span>
        </Show>
        <Show
          when={
            !result.matched &&
            (result as Extract<LoaderMatchResult, { matched: false }>).error
          }
        >
          <span class='text-destructive shrink-0'>error</span>
        </Show>
      </button>
      <Show when={open()}>
        <div class='border-t border-border'>
          <Show when={result.matched}>
            <Show when={(result as Extract<LoaderMatchResult, { matched: true }>).validationErrors.length > 0}>
              <div class='px-2 py-1.5 flex flex-col gap-0.5'>
                <span class='text-muted-foreground mb-0.5'>
                  validation errors
                </span>
                <For each={(result as Extract<LoaderMatchResult, { matched: true }>).validationErrors}>
                  {(err) => (
                    <span class='font-mono text-destructive'>{err}</span>
                  )}
                </For>
              </div>
            </Show>
            <pre class='px-2 py-2 font-mono text-muted-foreground whitespace-pre-wrap overflow-auto max-h-64'>
              {JSON.stringify((result as Extract<LoaderMatchResult, { matched: true }>).patches, null, 2)}
            </pre>
          </Show>
          <Show when={!result.matched}>
            <Show when={(result as Extract<LoaderMatchResult, { matched: false }>).error}>
              <div class='px-2 py-1.5'>
                <span class='font-mono text-destructive'>{(result as Extract<LoaderMatchResult, { matched: false }>).error}</span>
              </div>
            </Show>
          </Show>
        </div>
      </Show>
    </div>
  )
}

function CaptureRow({
  capture,
  onSelect,
  selected,
}: {
  capture: CaptureEntry
  selected: boolean
  onSelect: () => void
}) {
  const [matches, setMatches] = createSignal<LoaderMatchResult[] | null>(null)
  const [loading, setLoading] = createSignal(false)
  const [expanded, setExpanded] = createSignal(false)

  async function toggle() {
    if (selected) {
      onSelect()
      return
    }
    onSelect()
    if (matches() !== null) {
      return
    }
    setLoading(true)
    try {
      const results = await sendMessage(
        'match-capture',
        { captureId: capture.id },
        { context: 'background', tabId: 0 },
      )
      setMatches(results)
    } finally {
      setLoading(false)
    }
  }

  const matchedCount = () => matches()?.filter((r) => r.matched).length ?? 0

  return (
    <div
      class={`rounded-md border text-xs transition-colors ${selected ? 'border-foreground' : 'border-transparent hover:border-border'}`}
    >
      <div
        class='flex items-center gap-2 px-2 py-1.5 cursor-pointer'
        onClick={toggle}
      >
        <span class='font-mono text-muted-foreground w-10 shrink-0 uppercase'>
          {capture.method}
        </span>
        <span class='flex-1 truncate font-mono'>
          {new URL(capture.url).pathname}
        </span>
        <span
          class={`shrink-0 ${capture.status >= 400 ? 'text-destructive' : 'text-muted-foreground'}`}
        >
          {capture.status}
        </span>
        <Show when={loading()}>
          <span class='shrink-0 text-muted-foreground'>...</span>
        </Show>
        <Show when={matches() !== null && !loading()}>
          <span
            class={`shrink-0 ${matchedCount() > 0 ? 'text-green-500' : 'text-muted-foreground'}`}
          >
            {matchedCount()} match{matchedCount() === 1 ? '' : 'es'}
          </span>
          <Show
            when={matches()!.some(
              (r) =>
                r.matched &&
                (r as Extract<LoaderMatchResult, { matched: true }>)
                  .validationErrors.length > 0,
            )}
          >
            <span class='text-destructive shrink-0'>✕</span>
          </Show>
        </Show>
        <span class='shrink-0 text-muted-foreground'>
          {relativeTime(capture.capturedAt)}
        </span>
        <button
          type='button'
          onClick={(e) => {
            e.stopPropagation()
            setExpanded((v) => !v)
          }}
          class='shrink-0 text-muted-foreground hover:text-foreground px-1'
        >
          {expanded() ? '▲' : '▼'}
        </button>
      </div>
      <Show when={expanded()}>
        <pre class='px-2 pb-2 text-xs font-mono text-muted-foreground whitespace-pre-wrap overflow-auto max-h-48 border-t border-border'>
          {(() => {
            try {
              return JSON.stringify(JSON.parse(capture.responseBody), null, 2)
            } catch {
              return capture.responseBody
            }
          })()}
        </pre>
      </Show>
      <Show when={selected && matches() !== null}>
        <div class='border-t border-border px-2 py-2 flex flex-col gap-1.5'>
          <For each={matches()!.filter((r) => r.matched)}>
            {(result) => <MatchResult result={result} />}
          </For>
          <Show when={matches()!.every((r) => !r.matched)}>
            <p class='text-muted-foreground px-1 py-0.5'>
              No loaders matched this request.
            </p>
          </Show>
          <Show
            when={matches()!.some(
              (r) =>
                !r.matched &&
                (r as Extract<LoaderMatchResult, { matched: false }>).error,
            )}
          >
            <details class='mt-0.5'>
              <summary class='cursor-pointer text-muted-foreground select-none px-1 py-0.5 hover:text-foreground'>
                {matches()!.filter((r) => !r.matched).length} unmatched loaders
              </summary>
              <div class='flex flex-col gap-1.5 mt-1.5'>
                <For each={matches()!.filter((r) => !r.matched)}>
                  {(result) => <MatchResult result={result} />}
                </For>
              </div>
            </details>
          </Show>
        </div>
      </Show>
    </div>
  )
}

export function SpecGenerator() {
  const [captures, setCaptures] = createSignal<CaptureEntry[]>([])
  const [selected, setSelected] = createSignal<string | null>(null)
  const [hostname, setHostname] = createSignal('')

  onMount(async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
    if (!tab?.url) {
      return
    }
    let h: string
    try {
      h = new URL(tab.url).hostname
    } catch {
      return
    }
    setHostname(h)
    const entries = await sendMessage(
      'get-captures',
      { hostname: h },
      { context: 'background', tabId: 0 },
    )
    setCaptures(entries)
  })

  return (
    <div class='flex flex-col min-h-[300px] p-3 gap-3'>
      <div class='flex items-center justify-between'>
        <p class='text-xs text-muted-foreground'>
          {captures().length === 0
            ? 'No captures yet for this page. Browse around to capture requests.'
            : `${captures().length} captured request${captures().length === 1 ? '' : 's'} for ${hostname()}`}
        </p>
        <button
          type='button'
          onClick={() =>
            chrome.tabs.create({
              url: chrome.runtime.getURL('playground.html'),
            })
          }
          class='text-xs px-2 py-1 rounded border border-border hover:bg-accent transition-colors shrink-0'
        >
          Playground
        </button>
      </div>
      <div class='flex flex-col gap-1'>
        <For each={captures()}>
          {(capture) => (
            <CaptureRow
              capture={capture}
              selected={selected() === capture.id}
              onSelect={() =>
                setSelected((prev) => (prev === capture.id ? null : capture.id))
              }
            />
          )}
        </For>
      </div>
    </div>
  )
}
