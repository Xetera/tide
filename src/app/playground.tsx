/* @refresh reload */
import { render } from 'solid-js/web'
import {
  For,
  Show,
  createEffect,
  createSignal,
  onCleanup,
  onMount,
} from 'solid-js'
import { sendMessage } from 'webext-bridge/popup'
import { allSites } from '~/sites'
import type {
  LoaderInfo,
  LoaderFixture,
  CaptureEntry,
  GenerationAttempt,
} from '~/generation/types'
import Resizable from '@corvu/resizable'
import { HighlightedCode, JsonViewer } from './json-viewer'
import { JsonataEditor } from './jsonata-editor'
import { evaluate, relativeTime, type EvalResult } from './evaluate'
import '@unocss/reset/tailwind-compat.css'
import 'virtual:uno.css'
import './app.css'
import './scrape-viewer.css'

const IS_DEV = import.meta.env.DEV

function WarningsPanelResizer({ warningCount }: { warningCount: () => number }) {
  const context = Resizable.useContext()
  createEffect(() => {
    const count = warningCount()
    if (count === 0) {
      context.resize(1, 0)
    } else {
      context.resize(1, count >= 5 ? 0.5 : 0.3)
    }
  })
  return null
}

function Playground() {
  const [loaders, setLoaders] = createSignal<LoaderInfo[]>([])
  const [loadersLoading, setLoadersLoading] = createSignal(true)

  const [selectedLoader, setSelectedLoader] = createSignal<LoaderInfo | null>(
    null,
  )
  const [expression, setExpression] = createSignal('')
  const [selectedFixture, setSelectedFixture] =
    createSignal<LoaderFixture | null>(null)
  const [selectedCapture, setSelectedCapture] =
    createSignal<CaptureEntry | null>(null)
  const [captures, setCaptures] = createSignal<CaptureEntry[]>([])
  const [captureStatuses, setCaptureStatuses] = createSignal<
    Record<string, 'empty' | 'has-entities' | 'error'>
  >({})
  const [captureMatchedFiles, setCaptureMatchedFiles] = createSignal<
    Record<string, string[]>
  >({})
  const [captureHostname, setCaptureHostname] = createSignal<string | null>(
    null,
  )
  const [evalResult, setEvalResult] = createSignal<EvalResult | null>(null)
  const [writeStatus, setWriteStatus] = createSignal<
    'idle' | 'saving' | 'saved' | 'error'
  >('idle')
  const [llmStatus, setLlmStatus] = createSignal<
    'idle' | 'loading' | 'done' | 'error'
  >('idle')
  const [llmNote, setLlmNote] = createSignal('')
  const [generationAttempts, setGenerationAttempts] = createSignal<
    GenerationAttempt[]
  >([])
  const [writeError, setWriteError] = createSignal<string | null>(null)
  const [inputTab, setInputTab] = createSignal<'fixture' | 'capture'>('capture')
  const [newCaptureIds, setNewCaptureIds] = createSignal<Set<string>>(new Set())

  async function refreshCaptures(
    hostname: string,
    request?: { method: string; url: string },
    flash = true,
  ) {
    try {
      const entries = await sendMessage(
        'get-captures',
        { hostname, request },
        { context: 'background', tabId: 0 },
      )
      if (flash) {
        const existing = new Set(captures().map((c) => c.id))
        const added = entries
          .filter((e) => !existing.has(e.id))
          .map((e) => e.id)
        if (added.length > 0) {
          setNewCaptureIds((prev) => new Set([...prev, ...added]))
          setTimeout(() => {
            setNewCaptureIds((prev) => {
              const next = new Set(prev)
              for (const id of added) {
                next.delete(id)
              }
              return next
            })
          }, 1500)
        }
      }
      setCaptures(entries)
    } catch (err) {
      console.error('[spatula] get-captures failed', err)
    }
  }

  async function refreshLoaders() {
    try {
      const fresh = await sendMessage('get-loaders', undefined, {
        context: 'background',
        tabId: 0,
      })
      setLoaders(fresh)
      setLoadersLoading(false)
      setSelectedLoader((prev) => {
        if (!prev) {
          return null
        }
        const next = fresh.find((l) => l.path === prev.path)
        if (!next) {
          return prev
        }
        if (next.expression === prev.expression) {
          return prev
        }
        return next
      })
    } catch {}
  }

  onMount(async () => {
    refreshLoaders()
    const interval = setInterval(refreshLoaders, 2000)
    onCleanup(() => clearInterval(interval))

    const onStorageChanged = (
      changes: Record<string, chrome.storage.StorageChange>,
    ) => {
      if (changes['generation:attempts']) {
        setGenerationAttempts(changes['generation:attempts'].newValue ?? [])
      }
    }
    chrome.storage.local.onChanged.addListener(onStorageChanged)
    onCleanup(() =>
      chrome.storage.local.onChanged.removeListener(onStorageChanged),
    )

    const tabs = await chrome.tabs.query({ windowType: 'normal' })
    const extensionOrigin = new URL(chrome.runtime.getURL('')).origin
    const tab =
      tabs.find(
        (t) => t.url && !t.url.startsWith(extensionOrigin) && t.active,
      ) ?? tabs.find((t) => t.url && !t.url.startsWith(extensionOrigin))
    if (!tab?.url) {
      return
    }
    try {
      const hostname = new URL(tab.url).hostname
      setCaptureHostname(hostname)
    } catch (err) {
      console.error('[spatula] onMount error', err)
    }
  })

  const effectiveHostname = () => {
    const loader = selectedLoader()
    if (loader) {
      const site = allSites.find((s) => s.dir === loader.site)
      if (site) {
        return site.hostname
      }
    }
    return captureHostname()
  }

  createEffect(() => {
    const hostname = effectiveHostname()
    const request = selectedLoader()?.request
    if (!hostname) {
      return
    }
    refreshCaptures(hostname, request, false)
    const interval = setInterval(
      () => refreshCaptures(hostname, selectedLoader()?.request),
      2000,
    )
    onCleanup(() => clearInterval(interval))
  })

  createEffect(() => {
    const loader = selectedLoader()
    if (loader) {
      setExpression(loader.expression)
    }
  })

  function selectLoader(loader: LoaderInfo) {
    setSelectedLoader(loader)
    setEvalResult(null)
    setWriteStatus('idle')
    setSelectedFixture(loader.fixtures[0] ?? null)
    setSelectedCapture(null)
  }

  const activeInput = (): {
    data: unknown
    url: string
    method: string
    headers: Record<string, string>
  } | null => {
    if (inputTab() === 'capture') {
      const cap = selectedCapture()
      if (!cap) {
        return null
      }
      try {
        return {
          data: JSON.parse(cap.responseBody),
          url: cap.url,
          method: cap.method,
          headers: cap.requestHeaders,
        }
      } catch {
        return null
      }
    }
    const fixture = selectedFixture()
    if (!fixture) {
      return null
    }
    const f = fixture.data as {
      request?: {
        url?: string
        method?: string
        headers?: Record<string, string>
      }
      response?: { body?: unknown }
    }
    return {
      data: f.response?.body ?? fixture.data,
      url: f.request?.url ?? '',
      method: f.request?.method ?? 'GET',
      headers: f.request?.headers ?? {},
    }
  }

  createEffect(() => {
    const expr = expression()
    const currentInput = activeInput()
    if (!expr || !currentInput) {
      setEvalResult(null)
      return
    }
    const timer = setTimeout(async () => {
      const res = await evaluate(
        expr,
        currentInput.data,
        currentInput.url,
        currentInput.method,
        currentInput.headers,
      )
      setEvalResult(res)
    }, 30)
    return () => clearTimeout(timer)
  })

  createEffect(() => {
    const expr = expression()
    const currentCaptures = captures()
    const siblings = siblingLoaders()
    if (!expr || currentCaptures.length === 0) {
      return
    }
    const timer = setTimeout(async () => {
      const statuses: Record<string, 'empty' | 'has-entities' | 'error'> = {}
      const matchedFiles: Record<string, string[]> = {}
      await Promise.all(
        currentCaptures.map(async (cap) => {
          let body: unknown
          try {
            body = JSON.parse(cap.responseBody)
          } catch {
            statuses[cap.id] = 'error'
            return
          }
          const res = await evaluate(
            expr,
            body,
            cap.url,
            cap.method,
            cap.requestHeaders,
          )
          if (res.error || res.validationErrors.length > 0) {
            statuses[cap.id] = 'error'
          } else {
            statuses[cap.id] = res.patches.length > 0 ? 'has-entities' : 'empty'
          }
          if (siblings.length > 1) {
            const matched: string[] = []
            await Promise.all(
              siblings.map(async (sibling) => {
                const sibRes = await evaluate(
                  sibling.expression,
                  body,
                  cap.url,
                  cap.method,
                  cap.requestHeaders,
                )
                if (!sibRes.error && sibRes.patches.length > 0) {
                  matched.push(sibling.file)
                }
              }),
            )
            matchedFiles[cap.id] = matched
          }
        }),
      )
      setCaptureStatuses(statuses)
      setCaptureMatchedFiles(matchedFiles)
    }, 30)
    return () => clearTimeout(timer)
  })

  async function writeBack() {
    const loader = selectedLoader()
    if (!loader) {
      return
    }
    setWriteStatus('saving')
    setWriteError(null)
    const res = await sendMessage(
      'write-loader',
      { path: loader.path, content: expression() },
      { context: 'background', tabId: 0 },
    )
    if (res.ok) {
      setWriteStatus('saved')
      setTimeout(() => setWriteStatus('idle'), 2000)
    } else {
      setWriteStatus('error')
      setWriteError(res.error ?? 'Unknown error')
    }
  }

  async function generateJsonata() {
    const cap = selectedCapture()
    if (!cap) {
      return
    }
    setLlmStatus('loading')
    setGenerationAttempts([])
    const res = await sendMessage(
      'generate-jsonata',
      {
        captureId: cap.id,
        currentExpression: expression(),
        userNote: llmNote() || undefined,
      },
      { context: 'background', tabId: 0 },
    )
    if (res.ok) {
      setExpression(res.expression)
      setLlmStatus('done')
    } else {
      setLlmStatus('error')
    }
  }

  const loadersBySite = () => {
    const all = loaders() ?? []
    const sites: Record<string, Record<string, LoaderInfo[]>> = {}
    for (const l of all) {
      sites[l.site] ??= {}
      sites[l.site]![l.loader] ??= []
      sites[l.site]![l.loader]!.push(l)
    }
    return Object.entries(sites).map(([site, groups]) => ({
      site,
      groups: Object.entries(groups),
    }))
  }

  const siblingLoaders = () => {
    const loader = selectedLoader()
    if (!loader) {
      return []
    }
    return loaders().filter(
      (l) => l.site === loader.site && l.loader === loader.loader,
    )
  }

  const fixtureJson = () => {
    const fixture = selectedFixture()
    if (!fixture) {
      return null
    }
    return JSON.stringify(fixture.data, null, 2)
  }

  const captureJson = () => {
    const capture = selectedCapture()
    if (!capture) {
      return null
    }
    try {
      return JSON.stringify(JSON.parse(capture.responseBody), null, 2)
    } catch {
      return capture.responseBody
    }
  }

  const resultJson = () => {
    const res = evalResult()
    if (!res) {
      return null
    }
    return JSON.stringify(
      res.patches.length > 0 ? res.patches : res.raw,
      null,
      2,
    )
  }

  return (
    <div class='h-screen overflow-hidden bg-background text-foreground font-sans flex flex-col'>
      <div class='border-b border-border px-4 py-2 flex items-center gap-3'>
        <span class='font-semibold text-sm'>Spatula Playground</span>
        <Show when={IS_DEV}>
          <span class='text-xs px-1.5 py-0.5 rounded bg-yellow-500/15 text-yellow-600 dark:text-yellow-400'>
            dev
          </span>
        </Show>
      </div>

      <Resizable class='flex flex-1 overflow-hidden min-h-0'>
        <Resizable.Panel
          initialSize={0.15}
          minSize={0.1}
          class='border-r border-border overflow-y-auto flex flex-col [scrollbar-gutter:stable]'
        >
          <Show when={loadersLoading()}>
            <p class='text-xs text-muted-foreground p-3'>Loading...</p>
          </Show>
          <For each={loadersBySite()}>
            {({ site, groups }) => (
              <div>
                <div class='px-3 py-2 text-xs font-semibold sticky top-0 bg-background border-b border-border text-foreground'>
                  {site}
                </div>
                <For each={groups}>
                  {([group, files]) => (
                    <div>
                      <div class='px-3 py-1.5 text-xs font-medium bg-background border-b border-border flex items-center gap-2 min-w-0 justify-between'>
                        <span class='text-muted-foreground uppercase tracking-wider shrink-0'>
                          {group}
                        </span>
                        <Show when={files[0]?.request}>
                          {(req) => (
                            <span
                              class='text-muted-foreground truncate font-mono normal-case tracking-normal'
                              style='font-size: 0.65rem'
                            >
                              <span class='uppercase'>{req().method}</span>{' '}
                              {req().url}
                            </span>
                          )}
                        </Show>
                      </div>
                      <For each={files}>
                        {(loader) => {
                          const isSelected = () =>
                            selectedLoader()?.path === loader.path
                          return (
                            <button
                              type='button'
                              onClick={() => selectLoader(loader)}
                              class={`w-full text-left px-3 py-1.5 text-xs font-mono truncate transition-colors hover:bg-accent ${isSelected() ? 'bg-accent text-foreground' : 'text-muted-foreground'}`}
                            >
                              {loader.file}
                            </button>
                          )
                        }}
                      </For>
                    </div>
                  )}
                </For>
              </div>
            )}
          </For>
        </Resizable.Panel>

        <Resizable.Handle class='w-1 bg-border hover:bg-foreground/30 transition-colors cursor-col-resize' />

        <Resizable.Panel
          initialSize={0.85}
          minSize={0.1}
          class='flex overflow-hidden'
        >
          <Show
            when={selectedLoader()}
            fallback={
              <div class='flex-1 flex items-center justify-center text-sm text-muted-foreground'>
                Select a loader to get started
              </div>
            }
          >
            {(loader) => (
              <Resizable class='flex-1 flex overflow-hidden'>
                <Resizable.Panel
                  initialSize={0.333}
                  minSize={0.1}
                  class='flex flex-col overflow-hidden'
                >
                  <div class='border-b border-border px-3 py-1.5 flex items-center justify-between shrink-0'>
                    <span class='text-xs font-mono text-muted-foreground'>
                      {loader().path}
                    </span>
                    <Show when={IS_DEV}>
                      <button
                        type='button'
                        onClick={writeBack}
                        disabled={writeStatus() === 'saving'}
                        class={`text-xs px-2 py-1 rounded border transition-colors disabled:opacity-50 ${
                          writeStatus() === 'saved'
                            ? 'border-green-500 text-green-500'
                            : writeStatus() === 'error'
                              ? 'border-destructive text-destructive'
                              : 'border-border hover:bg-accent'
                        }`}
                      >
                        {writeStatus() === 'saving'
                          ? 'Saving...'
                          : writeStatus() === 'saved'
                            ? 'Saved'
                            : writeStatus() === 'error'
                              ? 'Error'
                              : 'Write'}
                      </button>
                    </Show>
                  </div>
                  <Show when={writeStatus() === 'error' && writeError()}>
                    <div class='px-3 py-1.5 text-xs text-destructive border-b border-border bg-destructive/5 shrink-0'>
                      {writeError()}
                    </div>
                  </Show>
                  <JsonataEditor
                    value={expression}
                    onInput={setExpression}
                    entityNames={allSites.flatMap((s) =>
                      s.entities.map((e) => e.entity),
                    )}
                  />
                  <Show
                    when={
                      llmStatus() !== 'idle' || generationAttempts().length > 0
                    }
                  >
                    <div
                      class='border-t border-border flex flex-col overflow-hidden shrink-0'
                      style='max-height: 40%'
                    >
                      <div class='px-3 py-1.5 flex items-center justify-between border-b border-border shrink-0'>
                        <span class='text-xs text-muted-foreground'>
                          {llmStatus() === 'loading'
                            ? `Attempt ${generationAttempts().length + 1}...`
                            : llmStatus() === 'error'
                              ? 'Generation failed'
                              : `${generationAttempts().length} attempt${generationAttempts().length === 1 ? '' : 's'}`}
                        </span>
                        <button
                          type='button'
                          onClick={() => {
                            setLlmStatus('idle')
                            setGenerationAttempts([])
                          }}
                          class='text-xs text-muted-foreground hover:text-foreground transition-colors'
                        >
                          dismiss
                        </button>
                      </div>
                      <div class='overflow-y-auto flex flex-col gap-0'>
                        <For each={generationAttempts()}>
                          {(attempt) => (
                            <div class='border-b border-border last:border-b-0'>
                              <div class='px-3 py-1.5 flex items-center gap-2 bg-accent/30'>
                                <span class='text-xs font-medium text-muted-foreground'>
                                  Attempt {attempt.attempt}
                                </span>
                                <Show
                                  when={attempt.validationErrors.length === 0}
                                >
                                  <span class='text-xs text-green-600 dark:text-green-400'>
                                    passed
                                  </span>
                                </Show>
                                <Show
                                  when={attempt.validationErrors.length > 0}
                                >
                                  <span class='text-xs text-destructive'>
                                    {attempt.validationErrors.length} error
                                    {attempt.validationErrors.length === 1
                                      ? ''
                                      : 's'}
                                  </span>
                                </Show>
                              </div>
                              <Show when={attempt.jsonataExpression}>
                                <pre class='px-3 py-2 text-xs font-mono text-muted-foreground overflow-x-auto border-b border-border whitespace-pre-wrap break-all bg-background/50'>
                                  {attempt.jsonataExpression}
                                </pre>
                              </Show>
                              <Show when={attempt.validationErrors.length > 0}>
                                <div class='px-3 py-1.5 flex flex-col gap-0.5'>
                                  <For each={attempt.validationErrors}>
                                    {(err) => (
                                      <p class='text-xs font-mono text-destructive'>
                                        {err}
                                      </p>
                                    )}
                                  </For>
                                </div>
                              </Show>
                            </div>
                          )}
                        </For>
                        <Show when={llmStatus() === 'loading'}>
                          <div class='px-3 py-2'>
                            <p class='text-xs text-muted-foreground'>
                              Calling model...
                            </p>
                          </div>
                        </Show>
                      </div>
                    </div>
                  </Show>
                  <div class='border-t border-border shrink-0 flex flex-col'>
                    <textarea
                      value={llmNote()}
                      onInput={(e) => setLlmNote(e.currentTarget.value)}
                      placeholder='Additional instructions...'
                      rows={2}
                      class='w-full px-3 py-2 text-xs bg-transparent resize-none outline-none text-foreground placeholder:text-muted-foreground border-b border-border'
                    />
                    <div class='px-3 py-2 flex items-center justify-between'>
                      <Show
                        when={selectedCapture()}
                        fallback={
                          <span class='text-xs text-muted-foreground'>
                            Select a capture to generate
                          </span>
                        }
                      >
                        <button
                          type='button'
                          onClick={generateJsonata}
                          disabled={llmStatus() === 'loading'}
                          class='text-xs px-2 py-1 rounded border border-border hover:bg-accent transition-colors disabled:opacity-50'
                        >
                          {llmStatus() === 'loading'
                            ? 'Generating...'
                            : '✦ Generate'}
                        </button>
                      </Show>
                    </div>
                  </div>
                  <Show when={evalResult()?.error}>
                    <div
                      class='px-3 py-2 text-xs font-mono text-destructive border-t border-destructive/30 bg-destructive/5 shrink-0 truncate'
                      title={evalResult()?.error}
                    >
                      {evalResult()?.error}
                    </div>
                  </Show>
                </Resizable.Panel>

                <Resizable.Handle class='w-1 bg-border hover:bg-foreground/30 transition-colors cursor-col-resize' />

                <Resizable.Panel
                  initialSize={0.333}
                  minSize={0.1}
                  class='flex flex-col overflow-hidden'
                >
                  <div class='border-b border-border flex shrink-0'>
                    <button
                      type='button'
                      onClick={() => setInputTab('capture')}
                      class={`flex-1 px-3 py-1.5 text-xs transition-colors ${inputTab() === 'capture' ? 'text-foreground border-b-2 border-foreground' : 'text-muted-foreground hover:text-foreground'}`}
                    >
                      Captures ({captures().length})
                    </button>
                    <button
                      type='button'
                      onClick={() => setInputTab('fixture')}
                      class={`flex-1 px-3 py-1.5 text-xs transition-colors ${inputTab() === 'fixture' ? 'text-foreground border-b-2 border-foreground' : 'text-muted-foreground hover:text-foreground'}`}
                    >
                      Fixtures
                    </button>
                  </div>

                  <Show when={inputTab() === 'fixture'}>
                    <div class='flex flex-col overflow-hidden flex-1'>
                      <div class='border-b border-border flex flex-col gap-0.5 p-1.5 shrink-0'>
                        <For
                          each={loader().fixtures}
                          fallback={
                            <p class='text-xs text-muted-foreground px-1.5 py-1'>
                              No fixtures
                            </p>
                          }
                        >
                          {(fixture) => {
                            const isSelected = () =>
                              selectedFixture()?.name === fixture.name
                            return (
                              <button
                                type='button'
                                onClick={() => {
                                  setSelectedFixture(fixture)
                                  setSelectedCapture(null)
                                }}
                                class={`text-left px-2 py-1 rounded text-xs font-mono transition-colors ${isSelected() ? 'bg-accent text-foreground' : 'text-muted-foreground hover:bg-accent/50'}`}
                              >
                                {fixture.name}
                              </button>
                            )
                          }}
                        </For>
                      </div>
                      <div class='flex-1 overflow-auto [scrollbar-gutter:stable]'>
                        {fixtureJson() && (
                          <HighlightedCode code={() => fixtureJson()!} lang='json' />
                        )}
                      </div>
                    </div>
                  </Show>

                  <Show when={inputTab() === 'capture'}>
                    <div class='flex flex-col overflow-hidden flex-1'>
                      <div class='border-b border-border flex flex-col gap-0.5 p-1.5 shrink-0'>
                        <For
                          each={captures()}
                          fallback={
                            <p class='text-xs text-muted-foreground px-1.5 py-1'>
                              No recent captures
                            </p>
                          }
                        >
                          {(capture) => {
                            const isSelected = () =>
                              selectedCapture()?.id === capture.id
                            const status = () => captureStatuses()[capture.id]
                            const isEmpty = () => status() === 'empty'
                            const hasError = () => status() === 'error'
                            const isNew = () => newCaptureIds().has(capture.id)
                            const matchedFiles = () =>
                              captureMatchedFiles()[capture.id]
                            return (
                              <button
                                type='button'
                                onClick={() => {
                                  setSelectedCapture(capture)
                                  setSelectedFixture(null)
                                }}
                                class={`text-left px-2 py-1 rounded text-xs font-mono transition-all duration-700 flex items-center gap-1.5 min-w-0 ${isSelected() ? 'bg-accent text-foreground' : isNew() ? 'text-blue-400 hover:bg-accent/50' : isEmpty() ? 'text-muted-foreground/40 hover:bg-accent/50 hover:text-muted-foreground' : 'text-muted-foreground hover:bg-accent/50'}`}
                              >
                                <span class='uppercase shrink-0'>
                                  {capture.method}
                                </span>
                                <span class='truncate flex-1'>
                                  {new URL(capture.url).pathname}
                                </span>
                                <Show
                                  when={
                                    matchedFiles() !== undefined &&
                                    matchedFiles()!.length > 0
                                  }
                                >
                                  <span
                                    class='shrink-0 flex items-center gap-1'
                                    style='font-size: 0.65rem'
                                  >
                                    <For each={matchedFiles()}>
                                      {(file) => {
                                        const target = siblingLoaders().find(
                                          (l) => l.file === file,
                                        )
                                        return (
                                          <span
                                            class='text-muted-foreground/60 hover:text-foreground transition-colors cursor-pointer underline underline-offset-2 decoration-dotted'
                                            onClick={(e) => {
                                              e.stopPropagation()
                                              if (target) {
                                                selectLoader(target)
                                              }
                                              setSelectedCapture(capture)
                                              setSelectedFixture(null)
                                            }}
                                          >
                                            {file}
                                          </span>
                                        )
                                      }}
                                    </For>
                                  </span>
                                </Show>
                                <span class='shrink-0 text-muted-foreground/60 tabular-nums w-[6ch] text-right whitespace-nowrap'>
                                  {relativeTime(capture.capturedAt)}
                                </span>
                                <Show when={status() !== undefined}>
                                  <span
                                    class={`ml-2 h-1.5 w-1.5 rounded-full shrink-0 ${hasError() ? 'bg-destructive' : isEmpty() ? 'bg-muted-foreground/30' : 'bg-green-500'}`}
                                    title={
                                      hasError()
                                        ? 'Validation errors'
                                        : isEmpty()
                                          ? 'No entities'
                                          : 'OK'
                                    }
                                  />
                                </Show>
                              </button>
                            )
                          }}
                        </For>
                      </div>
                      <div class='flex-1 overflow-hidden'>
                        <JsonViewer code={captureJson} />
                      </div>
                    </div>
                  </Show>
                </Resizable.Panel>

                <Resizable.Handle class='w-1 bg-border hover:bg-foreground/30 transition-colors cursor-col-resize' />

                <Resizable.Panel
                  initialSize={0.333}
                  minSize={0.1}
                  class='flex flex-col overflow-hidden'
                >
                  <div class='border-b border-border px-3 py-1.5 flex items-center gap-2 shrink-0'>
                    <span class='text-xs text-muted-foreground'>Result</span>
                    <Show when={evalResult()}>
                      {(res) => (
                        <>
                          <Show when={res().error}>
                            <span class='text-xs text-destructive ml-auto'>
                              error
                            </span>
                          </Show>
                          <Show when={!res().error}>
                            <span
                              class={`text-xs ml-auto ${res().validationErrors.length > 0 ? 'text-yellow-500' : 'text-green-500'}`}
                            >
                              {res().patches.length} patches
                              {res().validationErrors.length > 0
                                ? ` · ${res().validationErrors.length} errors`
                                : ''}
                            </span>
                          </Show>
                        </>
                      )}
                    </Show>
                  </div>
                  <Show when={evalResult()?.error}>
                    <div class='px-3 py-2 text-xs text-destructive font-mono shrink-0'>
                      {evalResult()?.error}
                    </div>
                  </Show>
                  <Show when={(evalResult()?.validationErrors.length ?? 0) > 0}>
                    <div class='border-b border-border px-3 py-2 flex flex-col gap-0.5 shrink-0 overflow-y-auto' style='max-height: 6rem'>
                      <For each={evalResult()!.validationErrors}>
                        {(err) => (
                          <span class='text-xs font-mono text-destructive'>
                            {err}
                          </span>
                        )}
                      </For>
                    </div>
                  </Show>
                  <Resizable orientation='vertical' class='flex-1 flex flex-col overflow-hidden min-h-0'>
                    <WarningsPanelResizer warningCount={() => evalResult()?.identityWarnings.length ?? 0} />
                    <Resizable.Panel class='flex flex-col overflow-hidden min-h-0'>
                      <div class='flex-1 overflow-hidden'>
                        <JsonViewer
                          code={resultJson}
                          validationErrors={() =>
                            evalResult()?.validationErrors ?? []
                          }
                          rawPatches={() => evalResult()?.patches ?? []}
                          unfoldSignal={expression}
                          foldKey={() =>
                            `${selectedFixture()?.name ?? ''}:${selectedCapture()?.id ?? ''}`
                          }
                          idToUrl={() => {
                            const patches = evalResult()?.patches ?? []
                            const entityCanonicalUrls = Object.fromEntries(
                              allSites.flatMap((s) =>
                                s.entities
                                  .filter((e) => e.canonicalUrl)
                                  .map((e) => [e.entity, e.canonicalUrl!]),
                              ),
                            )
                            return patches.map((patch) => {
                              const p = patch as Record<string, unknown>
                              const entity = p._entity as string
                              const id = p._id != null ? String(p._id) : null
                              const template = entityCanonicalUrls[entity]
                              const canonicalUrl = template
                                ? template.replace(/\{(\w+)\}/g, (_, key) =>
                                    String(p[key] ?? ''),
                                  )
                                : null
                              return { entity, id, canonicalUrl }
                            })
                          }}
                          foldByDefault
                        />
                      </div>
                      <Show
                        when={
                          !evalResult() && !selectedFixture() && !selectedCapture()
                        }
                      >
                        <p class='text-xs text-muted-foreground p-3'>
                          Select a fixture or capture
                        </p>
                      </Show>
                    </Resizable.Panel>
                    <Resizable.Handle
                      class='h-1 bg-border hover:bg-foreground/30 transition-colors cursor-row-resize'
                      classList={{ hidden: (evalResult()?.identityWarnings.length ?? 0) === 0 }}
                    />
                    <Resizable.Panel
                      class='flex flex-col overflow-hidden min-h-0'
                      classList={{ hidden: (evalResult()?.identityWarnings.length ?? 0) === 0 }}
                    >
                      <div class='border-t border-border px-3 py-1.5 shrink-0'>
                        <span class='text-xs text-muted-foreground'>Warnings</span>
                      </div>
                      <div class='flex-1 overflow-y-auto px-3 py-1.5 flex flex-col gap-0.5'>
                        <For each={evalResult()?.identityWarnings ?? []}>
                          {(warn) => (
                            <span class='text-xs font-mono text-yellow-500'>
                              {warn.message}
                            </span>
                          )}
                        </For>
                      </div>
                    </Resizable.Panel>
                  </Resizable>
                </Resizable.Panel>
              </Resizable>
            )}
          </Show>
        </Resizable.Panel>
      </Resizable>
    </div>
  )
}

const root = document.getElementById('root')!
render(() => <Playground />, root)
