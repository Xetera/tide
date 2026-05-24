/* @refresh reload */
import { render } from 'solid-js/web'
import {
  For,
  Show,
  createContext,
  createEffect,
  createSignal,
  onCleanup,
  onMount,
  useContext,
} from 'solid-js'
import { sendMessage } from 'webext-bridge/popup'
import { allSites } from '~/sites'
import { matchesGlob } from '~/extraction/glob'
import type {
  FunnelInfo,
  FunnelFixture,
  CaptureEntry,
  GenerationAttempt,
} from '~/generation/types'
import Resizable from '@corvu/resizable'
import { HighlightedCode, JsonViewer } from './json-viewer'
import { JsonataEditor, parseErrorPosition } from './jsonata-editor'
import {
  evaluate,
  evaluateHtmlegy,
  relativeTime,
  type EvalResult,
} from './evaluate'
import './app.css'
import './scrape-viewer.css'

const IS_DEV = import.meta.env.DEV

type FunnelInfoGroup = [string, FunnelInfo[]]
type SiteGroup = { site: string; hostname: string; groups: FunnelInfoGroup[] }

interface NewFunnelForm {
  site: string
  name: string
  format: 'jsonata' | 'htmlegy'
  status: 'idle' | 'creating' | 'error'
  error: string | null
}

interface PlaygroundState {
  funnels: () => FunnelInfo[]
  funnelsLoading: () => boolean
  selectedFunnel: () => FunnelInfo | null
  selectFunnel: (f: FunnelInfo) => void
  sites: () => SiteGroup[]
  expression: () => string
  setExpression: (v: string) => void
  isDirty: () => boolean
  writeStatus: () => 'idle' | 'saving' | 'saved' | 'error'
  writeError: () => string | null
  writeBack: () => void
  llmStatus: () => 'idle' | 'loading' | 'done' | 'error'
  llmNote: () => string
  setLlmNote: (v: string) => void
  generationAttempts: () => GenerationAttempt[]
  dismissGeneration: () => void
  canGenerate: () => boolean
  generateJsonata: () => void
  evalResult: () => EvalResult | null
  inputTab: () => 'fixture' | 'capture'
  setInputTab: (v: 'fixture' | 'capture') => void
  selectedFixture: () => FunnelFixture | null
  setSelectedFixture: (f: FunnelFixture | null) => void
  selectedCapture: () => CaptureEntry | null
  setSelectedCapture: (c: CaptureEntry | null) => void
  captures: () => CaptureEntry[]
  captureStatuses: () => Record<string, 'empty' | 'has-entities' | 'error'>
  captureMatchedFiles: () => Record<string, string[]>
  newCaptureIds: () => Set<string>
  siblingFunnels: () => FunnelInfo[]
  fixtureJson: () => string | null
  captureJson: () => string | null
  resultJson: () => string | null
  isHtmlegy: () => boolean
  htmlInputTab: () => 'html' | 'url' | 'tab'
  setHtmlInputTab: (v: 'html' | 'url' | 'tab') => void
  htmlInput: () => string
  setHtmlInput: (v: string) => void
  urlInput: () => string
  setUrlInput: (v: string) => void
  urlFetchStatus: () => 'idle' | 'loading' | 'error'
  loadUrl: () => void
  iframeBody: () => HTMLElement | null
  setIframeBody: (el: HTMLElement | null) => void
  setIframeRef: (el: HTMLIFrameElement) => void
  onIframeLoad: (body: HTMLElement | null, tab: 'html' | 'url' | 'tab') => void
  liveTabs: () => Array<{ tabId: number; title: string; url: string }>
  selectedLiveTab: () => number | null
  liveTabStatus: () => 'idle' | 'loading' | 'error'
  selectLiveTab: (tabId: number) => void
  newFunnelForm: () => NewFunnelForm | null
  openNewFunnelForm: (site: string) => void
  closeNewFunnelForm: () => void
  setNewFunnelName: (name: string) => void
  setNewFunnelFormat: (format: 'jsonata' | 'htmlegy') => void
  submitNewFunnel: () => void
}

const PlaygroundContext = createContext<PlaygroundState>()

function usePlayground(): PlaygroundState {
  const ctx = useContext(PlaygroundContext)
  if (!ctx) {
    throw new Error('usePlayground must be used inside Playground')
  }
  return ctx
}

function WarningsPanelResizer({
  warningCount,
}: {
  warningCount: () => number
}) {
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

function FunnelGroupRow({
  group,
  files,
}: {
  group: string
  files: FunnelInfo[]
}) {
  const { selectedFunnel, selectFunnel } = usePlayground()
  const selectedPath = () => selectedFunnel()?.path

  const formatBadge = (format: 'jsonata' | 'htmlegy') =>
    format === 'htmlegy' ? (
      <span
        class='shrink-0 font-mono text-orange-500/70 inline-block w-[1.75rem] text-center'
        style='font-size: 0.6rem'
      >
        &lt;/&gt;
      </span>
    ) : (
      <span
        class='shrink-0 font-mono text-blue-500/70 inline-block w-[1.75rem] text-center'
        style='font-size: 0.6rem'
      >
        {'{}'}
      </span>
    )

  const urlGlob = (
    req: { method: string; url: string | string[] } | undefined,
  ) =>
    req ? (
      <span
        class='text-muted-foreground/40 truncate font-mono'
        style='font-size: 0.6rem'
      >
        {Array.isArray(req.url) ? req.url[0] : req.url}
      </span>
    ) : null

  if (files.length === 1) {
    const loader = files[0]!
    const isSelected = () => selectedPath() === loader.path
    return (
      <div class='mb-1'>
        <button
          type='button'
          onClick={() => selectFunnel(loader)}
          class={`w-full text-left px-3 py-1 text-xs font-mono truncate transition-colors hover:bg-accent flex items-center gap-1.5 min-w-0 ${isSelected() ? 'bg-accent text-foreground' : 'text-muted-foreground'}`}
        >
          {formatBadge(loader.format)}
          <span class='shrink-0'>{group}</span>
          {urlGlob(loader.request)}
        </button>
      </div>
    )
  }

  return (
    <div class='mb-1'>
      <div class='px-3 py-1 flex items-center gap-1.5 min-w-0'>
        <span class='text-xs text-muted-foreground/60 font-mono shrink-0'>
          {group}
        </span>
        {urlGlob(files[0]?.request)}
      </div>
      <For each={files}>
        {(loader) => {
          const isSelected = () => selectedPath() === loader.path
          return (
            <button
              type='button'
              onClick={() => selectFunnel(loader)}
              class={`w-full text-left px-3 py-1 text-xs font-mono truncate transition-colors hover:bg-accent flex items-center gap-1.5 min-w-0 ${isSelected() ? 'bg-accent text-foreground' : 'text-muted-foreground'}`}
            >
              {formatBadge(loader.format)}
              {loader.file}
            </button>
          )
        }}
      </For>
    </div>
  )
}

function FunnelSidebar() {
  const { funnelsLoading, sites, newFunnelForm, openNewFunnelForm } =
    usePlayground()
  return (
    <Resizable.Panel
      initialSize={0.15}
      minSize={0.1}
      class='border-r border-border overflow-y-auto flex flex-col'
    >
      <Show when={funnelsLoading()}>
        <p class='text-xs text-muted-foreground p-3'>Loading...</p>
      </Show>
      <For each={sites()}>
        {({ site, hostname, groups }) => (
          <div class='border-b border-border'>
            <div class='px-3 pt-3 pb-1.5 sticky top-0 bg-background flex items-center gap-2'>
              <img
                src={`https://icons.duckduckgo.com/ip3/${hostname}.ico`}
                alt=''
                width={14}
                height={14}
                class='shrink-0 rounded-sm'
              />
              <span class='text-xs font-medium text-muted-foreground flex-1'>
                {hostname}
              </span>
              <Show when={IS_DEV}>
                <button
                  type='button'
                  onClick={() => openNewFunnelForm(site)}
                  class={`text-muted-foreground/50 hover:text-muted-foreground transition-colors leading-none ${newFunnelForm()?.site === site ? 'text-foreground' : ''}`}
                  title='New funnel'
                  style='font-size: 0.85rem; line-height: 1'
                >
                  +
                </button>
              </Show>
            </div>
            <For each={groups}>
              {([group, files]) => (
                <FunnelGroupRow group={group} files={files} />
              )}
            </For>
          </div>
        )}
      </For>
    </Resizable.Panel>
  )
}

function GenerationAttemptList({
  status,
  attempts,
  onDismiss,
}: {
  status: () => 'idle' | 'loading' | 'done' | 'error'
  attempts: () => GenerationAttempt[]
  onDismiss: () => void
}) {
  return (
    <div
      class='border-t border-border flex flex-col overflow-hidden shrink-0'
      style='max-height: 40%'
    >
      <div class='px-3 py-1.5 flex items-center justify-between border-b border-border shrink-0'>
        <span class='text-xs text-muted-foreground'>
          {status() === 'loading'
            ? `Attempt ${attempts().length + 1}...`
            : status() === 'error'
              ? 'Generation failed'
              : `${attempts().length} attempt${attempts().length === 1 ? '' : 's'}`}
        </span>
        <button
          type='button'
          onClick={onDismiss}
          class='text-xs text-muted-foreground hover:text-foreground transition-colors'
        >
          dismiss
        </button>
      </div>
      <div class='overflow-y-auto flex flex-col gap-0'>
        <For each={attempts()}>
          {(attempt) => (
            <div class='border-b border-border last:border-b-0'>
              <div class='px-3 py-1.5 flex items-center gap-2 bg-accent/30'>
                <span class='text-xs font-medium text-muted-foreground'>
                  Attempt {attempt.attempt}
                </span>
                <Show when={attempt.validationErrors.length === 0}>
                  <span class='text-xs text-green-600 dark:text-green-400'>
                    passed
                  </span>
                </Show>
                <Show when={attempt.validationErrors.length > 0}>
                  <span class='text-xs text-destructive'>
                    {attempt.validationErrors.length} error
                    {attempt.validationErrors.length === 1 ? '' : 's'}
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
                      <p class='text-xs font-mono text-destructive'>{err}</p>
                    )}
                  </For>
                </div>
              </Show>
            </div>
          )}
        </For>
        <Show when={status() === 'loading'}>
          <div class='px-3 py-2'>
            <p class='text-xs text-muted-foreground'>Calling model...</p>
          </div>
        </Show>
      </div>
    </div>
  )
}

function EditorPanel() {
  const {
    selectedFunnel,
    expression,
    setExpression,
    writeStatus,
    writeError,
    isDirty,
    writeBack,
    llmStatus,
    llmNote,
    setLlmNote,
    generationAttempts,
    dismissGeneration,
    canGenerate,
    generateJsonata,
    evalResult,
  } = usePlayground()
  const evalError = () => evalResult()?.error
  const errorPosition = () => parseErrorPosition(evalResult()?.error ?? '')
  return (
    <Resizable.Panel
      initialSize={0.333}
      minSize={0.1}
      class='flex flex-col overflow-hidden'
    >
      <div class='border-b border-border px-3 py-1.5 flex items-center justify-between shrink-0'>
        <span class='text-xs font-mono text-muted-foreground'>
          {selectedFunnel()?.path}
        </span>
        <Show when={IS_DEV}>
          <button
            type='button'
            onClick={writeBack}
            disabled={writeStatus() === 'saving'}
            class={`text-xs px-2 py-1 rounded border transition-colors disabled:opacity-50 flex items-center gap-1.5 ${
              writeStatus() === 'saved'
                ? 'border-green-500 text-green-500'
                : writeStatus() === 'error'
                  ? 'border-destructive text-destructive'
                  : 'border-border hover:bg-accent'
            }`}
          >
            <Show when={isDirty() && writeStatus() === 'idle'}>
              <span class='w-1.5 h-1.5 rounded-full bg-current opacity-70' />
            </Show>
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
        entityNames={allSites.flatMap((s) => s.entities.map((e) => e.entity))}
        errorPosition={errorPosition}
      />
      <Show when={llmStatus() !== 'idle' || generationAttempts().length > 0}>
        <GenerationAttemptList
          status={llmStatus}
          attempts={generationAttempts}
          onDismiss={dismissGeneration}
        />
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
            when={canGenerate()}
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
              {llmStatus() === 'loading' ? 'Generating...' : '✦ Generate'}
            </button>
          </Show>
        </div>
      </div>
      <Show when={evalError()}>
        <div
          class='px-3 py-2 text-xs font-mono text-destructive border-t border-destructive/30 bg-destructive/5 shrink-0 truncate'
          title={evalError()}
        >
          {evalError()}
        </div>
      </Show>
    </Resizable.Panel>
  )
}

function CaptureItem({ capture }: { capture: CaptureEntry }) {
  const {
    selectedCapture,
    setSelectedCapture,
    setSelectedFixture,
    captureStatuses,
    captureMatchedFiles,
    newCaptureIds,
    siblingFunnels,
    selectFunnel,
  } = usePlayground()

  const isSelected = () => selectedCapture()?.id === capture.id
  const status = () => captureStatuses()[capture.id]
  const isNew = () => newCaptureIds().has(capture.id)
  const matchedFiles = () => captureMatchedFiles()[capture.id]

  const isEmpty = () => status() === 'empty'
  const hasError = () => status() === 'error'
  const hasMatches = () => {
    const mf = matchedFiles()
    return mf !== undefined && mf.length > 0
  }

  return (
    <button
      type='button'
      onClick={() => {
        setSelectedCapture(capture)
        setSelectedFixture(null)
      }}
      class={`text-left px-2 py-1 rounded text-xs font-mono transition-all duration-700 flex items-center gap-1.5 min-w-0 ${isSelected() ? 'bg-accent text-foreground' : isNew() ? 'text-blue-400 hover:bg-accent/50' : isEmpty() ? 'text-muted-foreground/40 hover:bg-accent/50 hover:text-muted-foreground' : 'text-muted-foreground hover:bg-accent/50'}`}
    >
      <span class='uppercase shrink-0'>{capture.method}</span>
      <span class='truncate flex-1'>{new URL(capture.url).pathname}</span>
      <Show when={hasMatches()}>
        <span
          class='shrink-0 flex items-center gap-1'
          style='font-size: 0.65rem'
        >
          <For each={matchedFiles()}>
            {(file) => {
              const target = siblingFunnels().find((l) => l.file === file)
              return (
                <span
                  class='text-muted-foreground/60 hover:text-foreground transition-colors cursor-pointer underline underline-offset-2 decoration-dotted'
                  onClick={(e) => {
                    e.stopPropagation()
                    if (target) {
                      selectFunnel(target)
                      setSelectedCapture(capture)
                      setSelectedFixture(null)
                    }
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
            hasError() ? 'Validation errors' : isEmpty() ? 'No entities' : 'OK'
          }
        />
      </Show>
    </button>
  )
}

function InputPanel() {
  const {
    selectedFunnel,
    isHtmlegy,
    inputTab,
    setInputTab,
    htmlInputTab,
    setHtmlInputTab,
    htmlInput,
    setHtmlInput,
    urlInput,
    setUrlInput,
    loadUrl,
    urlFetchStatus,
    iframeBody,
    setIframeBody,
    setIframeRef,
    onIframeLoad,
    liveTabs,
    selectedLiveTab,
    liveTabStatus,
    selectLiveTab,
    selectedFixture,
    setSelectedFixture,
    setSelectedCapture,
    fixtureJson,
    captures,
    captureJson,
  } = usePlayground()

  return (
    <Resizable.Panel
      initialSize={0.333}
      minSize={0.1}
      class='flex flex-col overflow-hidden'
    >
      <Show when={isHtmlegy() && htmlInputTab() !== 'tab'}>
        <iframe
          ref={setIframeRef}
          sandbox={htmlInputTab() === 'url' ? undefined : 'allow-same-origin'}
          srcdoc={htmlInputTab() === 'html' ? htmlInput() : undefined}
          style='display:none'
          onLoad={(e) => {
            const frame = e.currentTarget
            setIframeRef(frame)
            try {
              onIframeLoad(frame.contentDocument?.body ?? null, htmlInputTab())
            } catch {
              onIframeLoad(null, htmlInputTab())
            }
          }}
        />
      </Show>
      <Show
        when={isHtmlegy()}
        fallback={
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
        }
      >
        <div class='border-b border-border flex shrink-0'>
          <button
            type='button'
            onClick={() => {
              setHtmlInputTab('tab')
              setIframeBody(null)
            }}
            class={`flex-1 px-3 py-1.5 text-xs transition-colors ${htmlInputTab() === 'tab' ? 'text-foreground border-b-2 border-foreground' : 'text-muted-foreground hover:text-foreground'}`}
          >
            Live
          </button>
          <button
            type='button'
            onClick={() => {
              setHtmlInputTab('url')
              setIframeBody(null)
              setHtmlInput('')
            }}
            class={`flex-1 px-3 py-1.5 text-xs transition-colors ${htmlInputTab() === 'url' ? 'text-foreground border-b-2 border-foreground' : 'text-muted-foreground hover:text-foreground'}`}
          >
            URL
          </button>
          <button
            type='button'
            onClick={() => {
              setHtmlInputTab('html')
              setIframeBody(null)
              setHtmlInput('')
            }}
            class={`flex-1 px-3 py-1.5 text-xs transition-colors ${htmlInputTab() === 'html' ? 'text-foreground border-b-2 border-foreground' : 'text-muted-foreground hover:text-foreground'}`}
          >
            HTML
          </button>
        </div>
        <Show when={htmlInputTab() === 'tab'}>
          <div class='flex flex-col flex-1 overflow-hidden min-h-0'>
            <Show
              when={liveTabs().length === 0 && liveTabStatus() !== 'loading'}
            >
              <p class='text-xs text-muted-foreground p-3'>
                No matching tabs open
              </p>
            </Show>
            <Show when={liveTabs().length > 1}>
              <div class='border-b border-border flex gap-0 overflow-x-auto shrink-0'>
                <For each={liveTabs()}>
                  {(t) => (
                    <button
                      type='button'
                      onClick={() => selectLiveTab(t.tabId)}
                      class={`px-3 py-1.5 text-xs font-mono shrink-0 truncate max-w-[160px] transition-colors ${selectedLiveTab() === t.tabId ? 'text-foreground border-b-2 border-foreground' : 'text-muted-foreground hover:text-foreground'}`}
                      title={t.url}
                    >
                      {new URL(t.url).pathname || '/'}
                    </button>
                  )}
                </For>
              </div>
            </Show>
            <Show when={liveTabStatus() === 'error'}>
              <p class='text-xs text-destructive px-3 py-2 shrink-0'>
                Failed to fetch tab HTML
              </p>
            </Show>
            <iframe
              ref={setIframeRef}
              sandbox='allow-same-origin'
              srcdoc={htmlInput() || ' '}
              class='flex-1 w-full min-h-0 border-0'
              style={liveTabStatus() === 'loading' ? 'opacity:0.3' : ''}
              onLoad={(e) => {
                if (!htmlInput()) {
                  return
                }
                const frame = e.currentTarget
                setIframeRef(frame)
                try {
                  onIframeLoad(frame.contentDocument?.body ?? null, 'tab')
                } catch {
                  onIframeLoad(null, 'tab')
                }
              }}
            />
          </div>
        </Show>
        <Show when={htmlInputTab() === 'url'}>
          <div class='flex flex-col flex-1 gap-2 p-3'>
            <div class='flex gap-2'>
              <input
                type='url'
                value={urlInput()}
                onInput={(e) => setUrlInput(e.currentTarget.value)}
                onKeyDown={(e) => e.key === 'Enter' && loadUrl()}
                placeholder='https://...'
                class='flex-1 px-2 py-1 text-xs font-mono bg-transparent border border-border rounded outline-none text-foreground placeholder:text-muted-foreground focus:border-foreground/50'
              />
              <button
                type='button'
                onClick={loadUrl}
                disabled={urlFetchStatus() === 'loading' || !urlInput().trim()}
                class='px-2 py-1 text-xs border border-border rounded hover:bg-accent transition-colors disabled:opacity-50 shrink-0'
              >
                {urlFetchStatus() === 'loading' ? 'Loading...' : 'Load'}
              </button>
            </div>
            <Show when={urlFetchStatus() === 'error'}>
              <span class='text-xs text-destructive'>
                Could not read page DOM (cross-origin)
              </span>
            </Show>
            <Show when={iframeBody()}>
              <span class='text-xs text-muted-foreground'>Page loaded</span>
            </Show>
          </div>
        </Show>
        <Show when={htmlInputTab() === 'html'}>
          <textarea
            value={htmlInput()}
            onInput={(e) => setHtmlInput(e.currentTarget.value)}
            placeholder='Paste HTML here...'
            class='flex-1 w-full px-3 py-2 text-xs font-mono bg-transparent resize-none outline-none text-foreground placeholder:text-muted-foreground'
          />
        </Show>
      </Show>

      <Show when={!isHtmlegy() && inputTab() === 'fixture'}>
        <div class='flex flex-col overflow-hidden flex-1'>
          <div class='border-b border-border flex flex-col gap-0.5 p-1.5 shrink-0'>
            <For
              each={selectedFunnel()?.fixtures ?? []}
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

      <Show when={!isHtmlegy() && inputTab() === 'capture'}>
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
              {(capture) => <CaptureItem capture={capture} />}
            </For>
          </div>
          <div class='flex-1 overflow-hidden'>
            <JsonViewer code={captureJson} />
          </div>
        </div>
      </Show>
    </Resizable.Panel>
  )
}

function ResultPanel() {
  const {
    evalResult,
    resultJson,
    expression,
    selectedFixture,
    selectedCapture,
  } = usePlayground()
  return (
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
                <span class='text-xs text-destructive ml-auto'>error</span>
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
        <pre class='px-3 py-2 text-xs text-destructive font-mono shrink-0 whitespace-pre-wrap break-all'>
          {evalResult()?.error}
        </pre>
      </Show>
      <Show when={(evalResult()?.validationErrors.length ?? 0) > 0}>
        <div
          class='border-b border-border px-3 py-2 flex flex-col gap-0.5 shrink-0 overflow-y-auto'
          style='max-height: 6rem'
        >
          <For each={evalResult()!.validationErrors}>
            {(err) => (
              <span class='text-xs font-mono text-destructive'>{err}</span>
            )}
          </For>
        </div>
      </Show>
      <Resizable
        orientation='vertical'
        class='flex-1 flex flex-col overflow-hidden min-h-0'
      >
        <WarningsPanelResizer
          warningCount={() => evalResult()?.identityWarnings.length ?? 0}
        />
        <Resizable.Panel class='flex flex-col overflow-hidden min-h-0'>
          <div class='flex-1 overflow-hidden'>
            <JsonViewer
              code={resultJson}
              validationErrors={() => evalResult()?.validationErrors ?? []}
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
            when={!evalResult() && !selectedFixture() && !selectedCapture()}
          >
            <p class='text-xs text-muted-foreground p-3'>
              Select a fixture or capture
            </p>
          </Show>
        </Resizable.Panel>
        <Resizable.Handle
          class='h-1 bg-border hover:bg-foreground/30 transition-colors cursor-row-resize'
          classList={{
            hidden: (evalResult()?.identityWarnings.length ?? 0) === 0,
          }}
        />
        <Resizable.Panel
          class='flex flex-col overflow-hidden min-h-0'
          classList={{
            hidden: (evalResult()?.identityWarnings.length ?? 0) === 0,
          }}
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
  )
}

function NewFunnelPanel() {
  const {
    newFunnelForm,
    closeNewFunnelForm,
    setNewFunnelName,
    setNewFunnelFormat,
    submitNewFunnel,
    sites,
  } = usePlayground()

  const form = () => newFunnelForm()!
  const hostname = () =>
    sites().find((s) => s.site === form().site)?.hostname ?? form().site

  return (
    <div class='flex-1 flex flex-col items-center justify-center'>
      <div class='flex flex-col gap-3 w-64'>
        <span class='text-xs text-muted-foreground font-mono'>
          {hostname()}
        </span>
        <input
          ref={(el) => setTimeout(() => el.focus(), 0)}
          type='text'
          placeholder='funnel-name'
          value={form().name}
          onInput={(e) => setNewFunnelName(e.currentTarget.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              submitNewFunnel()
            }
            if (e.key === 'Escape') {
              closeNewFunnelForm()
            }
          }}
          class='px-2 py-1.5 text-xs font-mono bg-transparent border border-border rounded outline-none text-foreground placeholder:text-muted-foreground focus:border-foreground/50'
        />
        <div class='flex gap-2'>
          <button
            type='button'
            onClick={() => setNewFunnelFormat('jsonata')}
            class={`flex-1 px-2 py-1.5 text-xs rounded border transition-colors font-mono ${form().format === 'jsonata' ? 'border-blue-500 text-blue-500 bg-blue-500/10' : 'border-border text-muted-foreground hover:bg-accent'}`}
          >
            {'{}'} http
          </button>
          <button
            type='button'
            onClick={() => setNewFunnelFormat('htmlegy')}
            class={`flex-1 px-2 py-1.5 text-xs rounded border transition-colors font-mono ${form().format === 'htmlegy' ? 'border-orange-500 text-orange-500 bg-orange-500/10' : 'border-border text-muted-foreground hover:bg-accent'}`}
          >
            {'</>'} html
          </button>
        </div>
        <Show when={form().error}>
          <p class='text-xs text-destructive'>{form().error}</p>
        </Show>
        <div class='flex gap-2'>
          <button
            type='button'
            onClick={submitNewFunnel}
            disabled={!form().name.trim() || form().status === 'creating'}
            class='flex-1 px-2 py-1.5 text-xs border border-border rounded hover:bg-accent transition-colors disabled:opacity-50'
          >
            {form().status === 'creating' ? 'Creating...' : 'Create'}
          </button>
          <button
            type='button'
            onClick={closeNewFunnelForm}
            class='px-2 py-1.5 text-xs border border-border rounded hover:bg-accent transition-colors text-muted-foreground'
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}

function Playground() {
  const [funnels, setFunnels] = createSignal<FunnelInfo[]>([])
  const [funnelsLoading, setFunnelsLoading] = createSignal(true)
  const [selectedFunnel, setSelectedFunnel] = createSignal<FunnelInfo | null>(
    null,
  )
  const [expression, setExpression] = createSignal('')
  const [selectedFixture, setSelectedFixture] =
    createSignal<FunnelFixture | null>(null)
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
  const [htmlInput, setHtmlInput] = createSignal('')
  const [urlInput, setUrlInput] = createSignal('')
  const [htmlInputTab, setHtmlInputTab] = createSignal<'html' | 'url' | 'tab'>(
    'tab',
  )
  const [urlFetchStatus, setUrlFetchStatus] = createSignal<
    'idle' | 'loading' | 'error'
  >('idle')
  const [iframeBody, setIframeBody] = createSignal<HTMLElement | null>(null)
  const [liveTabs, setLiveTabs] = createSignal<
    Array<{ tabId: number; title: string; url: string }>
  >([])
  const [selectedLiveTab, setSelectedLiveTab] = createSignal<number | null>(
    null,
  )
  const [liveTabStatus, setLiveTabStatus] = createSignal<
    'idle' | 'loading' | 'error'
  >('idle')
  const [newFunnelForm, setNewFunnelForm] = createSignal<NewFunnelForm | null>(
    null,
  )
  let iframeRef: HTMLIFrameElement | undefined

  const isHtmlegy = () => selectedFunnel()?.format === 'htmlegy'

  async function loadLiveTabHtml(tabId: number) {
    setLiveTabStatus('loading')
    setIframeBody(null)
    try {
      const result = await sendMessage(
        'get-tab-html',
        { tabId },
        { context: 'background', tabId: 0 },
      )
      if (!result) {
        setLiveTabStatus('error')
        return
      }
      setHtmlInput(result.html)
      setLiveTabStatus('idle')
    } catch {
      setLiveTabStatus('error')
    }
  }

  async function selectLiveTab(tabId: number) {
    setSelectedLiveTab(tabId)
    await loadLiveTabHtml(tabId)
  }

  function loadUrl() {
    const url = urlInput().trim()
    if (!url || !iframeRef) {
      return
    }
    setUrlFetchStatus('loading')
    setIframeBody(null)
    iframeRef.removeAttribute('srcdoc')
    iframeRef.removeAttribute('sandbox')
    iframeRef.src = url
  }

  async function refreshCaptures(
    hostname: string,
    request?: { method: string; url: string | string[] },
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
      console.error('[tide] get-captures failed', err)
    }
  }

  async function refreshFunnels() {
    try {
      const fresh = await sendMessage('get-funnels', undefined, {
        context: 'background',
        tabId: 0,
      })
      setFunnels((prev) => {
        if (
          prev.length === fresh.length &&
          prev.every(
            (p, i) =>
              p.path === fresh[i]!.path &&
              p.expression === fresh[i]!.expression,
          )
        ) {
          return prev
        }
        return fresh
      })
      setFunnelsLoading(false)
      setSelectedFunnel((prev) => {
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
    refreshFunnels()
    const interval = setInterval(refreshFunnels, 2000)
    onCleanup(() => clearInterval(interval))

    const onStorageChanged = (
      changes: Record<string, chrome.storage.StorageChange>,
    ) => {
      if (changes['generation:attempts']) {
        setGenerationAttempts(
          (changes['generation:attempts'].newValue as GenerationAttempt[]) ??
            [],
        )
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
      setCaptureHostname(new URL(tab.url).hostname)
    } catch (err) {
      console.error('[tide] onMount error', err)
    }
  })

  const effectiveHostname = () => {
    const funnel = selectedFunnel()
    if (funnel) {
      const site = allSites.find((s) => s.id ===funnel.site)
      if (site) {
        return site.hostname
      }
    }
    return captureHostname()
  }

  createEffect(() => {
    const hostname = effectiveHostname()
    const request = selectedFunnel()?.request
    if (!hostname) {
      return
    }
    refreshCaptures(hostname, request, false)
    const interval = setInterval(
      () => refreshCaptures(hostname, selectedFunnel()?.request),
      2000,
    )
    onCleanup(() => clearInterval(interval))
  })

  createEffect(() => {
    if (!isHtmlegy() || htmlInputTab() !== 'tab') {
      return
    }
    const funnel = selectedFunnel()
    if (!funnel) {
      return
    }
    const site = allSites.find((s) => s.id ===funnel.site)
    if (!site) {
      return
    }
    void (async () => {
      const tabs = await sendMessage(
        'get-tabs-for-hostname',
        { hostname: site.hostname },
        { context: 'background', tabId: 0 },
      )
      setLiveTabs(tabs)
      if (tabs.length > 0) {
        const urlPattern = funnel.request?.url
        const urlPatterns = urlPattern
          ? Array.isArray(urlPattern)
            ? urlPattern
            : [urlPattern]
          : null
        const best = urlPatterns
          ? (tabs.find((t) => {
              try {
                const pathname = new URL(t.url).pathname
                return urlPatterns.some((p) => matchesGlob(p, pathname))
              } catch {
                return false
              }
            }) ?? tabs[0]!)
          : tabs[0]!
        setSelectedLiveTab(best.tabId)
        await loadLiveTabHtml(best.tabId)
      }
    })()
  })

  const funnelParam = new URLSearchParams(location.search).get('funnel')
  let funnelParamApplied = false
  createEffect(() => {
    if (funnelParam && !funnelParamApplied && funnels().length > 0) {
      const match = funnels().find((l) => l.path === funnelParam)
      if (match) {
        funnelParamApplied = true
        selectFunnel(match)
      }
    }
  })

  createEffect(() => {
    const funnel = selectedFunnel()
    if (funnel) {
      setExpression(funnel.expression)
    }
  })

  function selectFunnel(funnel: FunnelInfo) {
    setSelectedFunnel(funnel)
    setNewFunnelForm(null)
    setEvalResult(null)
    setWriteStatus('idle')
    setSelectedFixture(null)
    setSelectedCapture(null)
    if (funnel.format === 'htmlegy') {
      setHtmlInputTab('tab')
      setLiveTabs([])
      setSelectedLiveTab(null)
      setIframeBody(null)
    }
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
    if (isHtmlegy()) {
      const html = htmlInput()
      const root = iframeBody()
      const entity = selectedFunnel()?.funnel ?? ''
      if (!expr || (!root && !html)) {
        setEvalResult(null)
        return
      }
      const timer = setTimeout(() => {
        const body = iframeRef?.contentDocument?.body ?? root
        if (!body) {
          setEvalResult(null)
          return
        }
        setEvalResult(evaluateHtmlegy(expr, entity, body))
      }, 100)
      return () => clearTimeout(timer)
    }
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
    const siblings = siblingFunnels()
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

  const isDirty = () => expression() !== (selectedFunnel()?.expression ?? '')

  async function writeBack() {
    const funnel = selectedFunnel()
    if (!funnel) {
      return
    }
    setWriteStatus('saving')
    setWriteError(null)
    const res = await sendMessage(
      'write-funnel',
      { path: funnel.path, content: expression() },
      { context: 'background', tabId: 0 },
    )
    if (res.ok) {
      setWriteStatus('saved')
      setSelectedFunnel({ ...funnel, expression: expression() })
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

  function openNewFunnelForm(site: string) {
    setSelectedFunnel(null)
    setNewFunnelForm({
      site,
      name: '',
      format: 'jsonata',
      status: 'idle',
      error: null,
    })
  }

  function closeNewFunnelForm() {
    setNewFunnelForm(null)
  }

  function setNewFunnelName(name: string) {
    setNewFunnelForm((prev) => (prev ? { ...prev, name, error: null } : null))
  }

  function setNewFunnelFormat(format: 'jsonata' | 'htmlegy') {
    setNewFunnelForm((prev) => (prev ? { ...prev, format } : null))
  }

  async function submitNewFunnel() {
    const form = newFunnelForm()
    if (!form || !form.name.trim()) {
      return
    }
    setNewFunnelForm((prev) =>
      prev ? { ...prev, status: 'creating', error: null } : null,
    )
    const res = await sendMessage(
      'create-funnel',
      { site: form.site, name: form.name.trim(), format: form.format },
      { context: 'background', tabId: 0 },
    )
    if (res.ok) {
      setNewFunnelForm(null)
      await refreshFunnels()
      const created = funnels().find((f) => f.path === res.path)
      if (created) {
        selectFunnel(created)
      }
    } else {
      setNewFunnelForm((prev) =>
        prev
          ? { ...prev, status: 'error', error: res.error ?? 'Unknown error' }
          : null,
      )
    }
  }

  const sites = (): SiteGroup[] => {
    const all = funnels() ?? []
    const siteMap: Record<string, Record<string, FunnelInfo[]>> = {}
    for (const l of all) {
      siteMap[l.site] ??= {}
      siteMap[l.site]![l.funnel] ??= []
      siteMap[l.site]![l.funnel]!.push(l)
    }
    return Object.entries(siteMap).map(([site, groups]) => ({
      site,
      hostname: allSites.find((s) => s.id === site)?.hostname ?? site,
      groups: Object.entries(groups).sort(
        ([, a], [, b]) => a.length - b.length,
      ),
    }))
  }

  const siblingFunnels = () => {
    const funnel = selectedFunnel()
    if (!funnel) {
      return []
    }
    return funnels().filter(
      (l) => l.site === funnel.site && l.funnel === funnel.funnel,
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

  const ctx: PlaygroundState = {
    funnels,
    funnelsLoading,
    selectedFunnel,
    selectFunnel,
    sites,
    expression,
    setExpression,
    isDirty,
    writeStatus,
    writeError,
    writeBack,
    llmStatus,
    llmNote,
    setLlmNote,
    generationAttempts,
    dismissGeneration: () => {
      setLlmStatus('idle')
      setGenerationAttempts([])
    },
    canGenerate: () => selectedCapture() !== null,
    generateJsonata,
    evalResult,
    inputTab,
    setInputTab,
    selectedFixture,
    setSelectedFixture,
    selectedCapture,
    setSelectedCapture,
    captures,
    captureStatuses,
    captureMatchedFiles,
    newCaptureIds,
    siblingFunnels,
    fixtureJson,
    captureJson,
    resultJson,
    isHtmlegy,
    htmlInputTab,
    setHtmlInputTab,
    htmlInput,
    setHtmlInput,
    urlInput,
    setUrlInput,
    urlFetchStatus,
    loadUrl,
    iframeBody,
    setIframeBody,
    setIframeRef: (el) => {
      iframeRef = el
    },
    onIframeLoad: (body, tab) => {
      setIframeBody(body)
      if (tab === 'url') {
        setUrlFetchStatus(body ? 'idle' : 'error')
      }
    },
    liveTabs,
    selectedLiveTab,
    liveTabStatus,
    selectLiveTab,
    newFunnelForm,
    openNewFunnelForm,
    closeNewFunnelForm,
    setNewFunnelName,
    setNewFunnelFormat,
    submitNewFunnel,
  }

  return (
    <PlaygroundContext.Provider value={ctx}>
      <div class='h-screen overflow-hidden bg-background text-foreground font-sans flex flex-col'>
        <div class='border-b border-border px-4 py-2 flex items-center gap-3'>
          <span class='font-semibold text-sm'>Tide Playground</span>
          <Show when={IS_DEV}>
            <span class='text-xs px-1.5 py-0.5 rounded bg-yellow-500/15 text-yellow-600 dark:text-yellow-400'>
              dev
            </span>
          </Show>
        </div>

        <Resizable class='flex flex-1 overflow-hidden min-h-0'>
          <FunnelSidebar />

          <Resizable.Handle class='w-1 bg-border hover:bg-foreground/30 transition-colors cursor-col-resize' />

          <Resizable.Panel
            initialSize={0.85}
            minSize={0.1}
            class='flex overflow-hidden'
          >
            <Show
              when={selectedFunnel()}
              fallback={
                <Show
                  when={newFunnelForm()}
                  fallback={
                    <div class='flex-1 flex items-center justify-center text-sm text-muted-foreground'>
                      Select a funnel to get started
                    </div>
                  }
                >
                  <NewFunnelPanel />
                </Show>
              }
            >
              <Resizable class='flex-1 flex overflow-hidden'>
                <EditorPanel />

                <Resizable.Handle class='w-1 bg-border hover:bg-foreground/30 transition-colors cursor-col-resize' />

                <InputPanel />

                <Resizable.Handle class='w-1 bg-border hover:bg-foreground/30 transition-colors cursor-col-resize' />

                <ResultPanel />
              </Resizable>
            </Show>
          </Resizable.Panel>
        </Resizable>
      </div>
    </PlaygroundContext.Provider>
  )
}

const root = document.getElementById('root')!
render(() => <Playground />, root)
