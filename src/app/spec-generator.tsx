import { For, Show, createEffect, createSignal, onMount } from 'solid-js'
import { sendMessage } from 'webext-bridge/popup'
import { useBrowserStorage } from '~/shared/hooks'
import type { CaptureEntry, GenerationAttempt, GenerationProgress, GenerationResult } from '~/generation/types'

const RESULT_TTL_MS = 5 * 60 * 1000

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

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = createSignal(false)

  function copy() {
    navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  return (
    <button
      type='button'
      onClick={copy}
      class='px-2 py-1 text-xs rounded border border-border hover:bg-accent transition-colors'
    >
      {copied() ? 'Copied' : 'Copy'}
    </button>
  )
}

export function SpecGenerator() {
  const [view, setView] = createSignal<'select' | 'in-progress' | 'result'>('select')
  const [captures, setCaptures] = createSignal<CaptureEntry[]>([])
  const [selected, setSelected] = createSignal<string | null>(null)
  const [expanded, setExpanded] = createSignal<string | null>(null)
  const [result, setResult] = createSignal<GenerationResult | null>(null)
  const [hostname, setHostname] = createSignal('')
  const { value: progress } = useBrowserStorage<'generation:progress'>('generation:progress', undefined)
  const { value: attempts } = useBrowserStorage<'generation:attempts'>('generation:attempts', undefined)
  const { value: lastResult } = useBrowserStorage<'generation:last-result'>('generation:last-result', undefined)

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

    const stored = lastResult()
    if (stored && Date.now() - stored.timestamp < RESULT_TTL_MS) {
      setResult(stored.result)
      setView('result')
      return
    }

    const entries = await sendMessage('get-captures', { hostname: h }, { context: 'background', tabId: 0 })
    setCaptures(entries)
  })

  createEffect(() => {
    const stored = lastResult()
    if (stored && Date.now() - stored.timestamp < RESULT_TTL_MS && view() === 'in-progress') {
      setResult(stored.result)
      setView('result')
    }
  })

  async function generate() {
    const id = selected()
    if (!id) {
      return
    }
    setView('in-progress')
    const res = await sendMessage(
      'generate-spec',
      { selectedCaptureIds: [id], targetHostname: hostname() },
      { context: 'background', tabId: 0 },
    )
    setResult(res)
    setView('result')
  }

  function reset() {
    setSelected(null)
    setExpanded(null)
    setResult(null)
    setView('select')
  }

  return (
    <div class='flex flex-col min-h-[300px]'>
      <Show when={view() === 'select'}>
        <div class='flex flex-col gap-3 p-3'>
          <p class='text-xs text-muted-foreground'>
            {captures().length === 0
              ? 'No captures yet for this page. Browse around to capture requests.'
              : `${captures().length} captured request${captures().length === 1 ? '' : 's'} for ${hostname()}`}
          </p>
          <div class='flex flex-col gap-1'>
            <For each={captures()}>
              {(capture) => {
                const isSelected = () => selected() === capture.id
                const isExpanded = () => expanded() === capture.id
                return (
                  <div
                    class={`rounded-md border text-xs transition-colors ${isSelected() ? 'border-foreground' : 'border-transparent hover:border-border'}`}
                  >
                    <div class='flex items-center gap-2 px-2 py-1.5 cursor-pointer'
                      onClick={() => setSelected(isSelected() ? null : capture.id)}
                    >
                      <span class='font-mono text-muted-foreground w-10 shrink-0 uppercase'>{capture.method}</span>
                      <span class='flex-1 truncate font-mono'>{new URL(capture.url).pathname}</span>
                      <span class={`shrink-0 ${capture.status >= 400 ? 'text-destructive' : 'text-muted-foreground'}`}>
                        {capture.status}
                      </span>
                      <span class='shrink-0 text-muted-foreground'>{relativeTime(capture.capturedAt)}</span>
                      <button
                        type='button'
                        onClick={(e) => { e.stopPropagation(); setExpanded(isExpanded() ? null : capture.id) }}
                        class='shrink-0 text-muted-foreground hover:text-foreground px-1'
                      >
                        {isExpanded() ? '▲' : '▼'}
                      </button>
                    </div>
                    <Show when={isExpanded()}>
                      <pre class='px-2 pb-2 text-xs font-mono text-muted-foreground whitespace-pre-wrap overflow-auto max-h-48 border-t border-border'>
                        {(() => { try { return JSON.stringify(JSON.parse(capture.responseBody), null, 2) } catch { return capture.responseBody } })()}
                      </pre>
                    </Show>
                  </div>
                )
              }}
            </For>
          </div>
          <button
            type='button'
            onClick={generate}
            disabled={selected() === null}
            class='px-3 py-1.5 text-sm rounded-md bg-foreground text-background hover:opacity-90 transition-opacity disabled:opacity-40 disabled:cursor-not-allowed'
          >
            Generate
          </button>
        </div>
      </Show>

      <Show when={view() === 'in-progress'}>
        <div class='flex flex-col gap-3 p-3'>
          <ProgressDisplay progress={progress()} attempts={attempts() ?? []} />
        </div>
      </Show>

      <Show when={view() === 'result' && result()}>
        {(res) => <ResultDisplay result={res()} onReset={reset} hostname={hostname()} attempts={attempts() ?? []} />}
      </Show>
    </div>
  )
}

function AttemptEntry({ attempt }: { attempt: GenerationAttempt }) {
  const failed = attempt.validationErrors.length > 0
  return (
    <div class='flex flex-col gap-1 border border-border rounded-md text-xs'>
      <details>
        <summary class={`cursor-pointer px-2 py-1.5 flex items-center gap-2 select-none ${failed ? 'text-destructive' : 'text-green-500'}`}>
          <span class='font-medium'>Attempt {attempt.attempt}</span>
          <span class='text-muted-foreground'>{failed ? `${attempt.validationErrors.length} error${attempt.validationErrors.length === 1 ? '' : 's'}` : 'passed'}</span>
        </summary>
        <div class='border-t border-border flex flex-col gap-2 p-2'>
          <Show when={attempt.jsonataExpression}>
            <pre class='font-mono text-muted-foreground whitespace-pre-wrap overflow-auto max-h-32'>{attempt.jsonataExpression}</pre>
          </Show>
          <Show when={failed}>
            <ul class='flex flex-col gap-0.5'>
              <For each={attempt.validationErrors}>
                {(err) => <li class='text-destructive font-mono'>{err}</li>}
              </For>
            </ul>
          </Show>
        </div>
      </details>
    </div>
  )
}

function ProgressDisplay({ progress, attempts }: { progress: GenerationProgress | undefined; attempts: GenerationAttempt[] }) {
  const stageLabel: Record<NonNullable<GenerationProgress['stage']>, string> = {
    assembling: 'Assembling prompt',
    'calling-api': 'Calling Gemini API',
    validating: 'Validating output',
    retrying: 'Retrying',
    done: 'Done',
    error: 'Error',
  }

  return (
    <div class='flex flex-col gap-3'>
      <p class='text-sm text-muted-foreground'>
        {progress
          ? `${stageLabel[progress.stage]}${progress.attempt ? ` (attempt ${progress.attempt}/${3})` : ''}...`
          : 'Starting...'}
      </p>
      <Show when={attempts.length > 0}>
        <div class='flex flex-col gap-2'>
          <For each={attempts}>{(a) => <AttemptEntry attempt={a} />}</For>
        </div>
      </Show>
    </div>
  )
}

function ResultDisplay({
  result,
  onReset,
  hostname,
  attempts,
}: {
  result: GenerationResult
  onReset: () => void
  hostname: string
  attempts: GenerationAttempt[]
}) {
  return (
    <div class='flex flex-col gap-3 p-3'>
      {result.success ? (
        (() => {
          const r = result as Extract<GenerationResult, { success: true }>
          const site = hostname.replace(/^www\./, '')
          const jsonataPath = `src/sites/${site}/loaders/${r.suggestedLoaderName}/request.jsonata`
          const fixturePath = `src/sites/${site}/loaders/${r.suggestedLoaderName}/validRequest.json`

          return (
            <div class='flex flex-col gap-4'>
              <div class='flex flex-col gap-1'>
                <div class='flex items-center justify-between'>
                  <span class='text-xs font-mono text-muted-foreground'>{jsonataPath}</span>
                  <CopyButton text={r.jsonataExpression} />
                </div>
                <pre class='text-xs font-mono bg-muted rounded-md p-2 overflow-auto max-h-48 whitespace-pre-wrap'>{r.jsonataExpression}</pre>
              </div>
              <div class='flex flex-col gap-1'>
                <div class='flex items-center justify-between'>
                  <span class='text-xs font-mono text-muted-foreground'>{fixturePath}</span>
                  <CopyButton text={r.fixtureJson} />
                </div>
                <pre class='text-xs font-mono bg-muted rounded-md p-2 overflow-auto max-h-48 whitespace-pre-wrap'>{r.fixtureJson}</pre>
              </div>
              <Show when={r.potentialEntities}>
                <div class='flex flex-col gap-1'>
                  <span class='text-xs text-muted-foreground font-medium'>Potential additional entities</span>
                  <pre class='text-xs font-mono bg-muted rounded-md p-2 whitespace-pre-wrap'>{r.potentialEntities}</pre>
                </div>
              </Show>
              <button
                type='button'
                onClick={onReset}
                class='px-3 py-1.5 text-sm rounded-md border border-border hover:bg-accent transition-colors'
              >
                Try again
              </button>
            </div>
          )
        })()
      ) : (
        <div class='flex flex-col gap-3'>
          <p class='text-sm text-destructive'>{(result as Extract<GenerationResult, { success: false }>).error}</p>
          <Show when={attempts.length > 0}>
            <div class='flex flex-col gap-2'>
              <For each={attempts}>{(a) => <AttemptEntry attempt={a} />}</For>
            </div>
          </Show>
          <button
            type='button'
            onClick={onReset}
            class='px-3 py-1.5 text-sm rounded-md border border-border hover:bg-accent transition-colors'
          >
            Try again
          </button>
        </div>
      )}
    </div>
  )
}
