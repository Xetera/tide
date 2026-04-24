/* @refresh reload */
import { render } from 'solid-js/web'
import { Show, createResource } from 'solid-js'
import {
  createHighlighterCore,
  createCssVariablesTheme,
} from 'shiki/dist/core.mjs'
import { createJavaScriptRegexEngine } from 'shiki/dist/engine-javascript.mjs'
import type { ScrapeLog } from '~/shared'
import '@unocss/reset/tailwind-compat.css'
import 'virtual:uno.css'
import './app.css'
import './scrape-viewer.css'

const [highlighter] = createResource(async () => {
  const [lang] = await Promise.all([import('shiki/dist/langs/json.mjs')])
  return createHighlighterCore({
    langs: [lang.default],
    themes: [
      createCssVariablesTheme({
        name: 'css-vars',
        variablePrefix: '--shiki-',
        variableDefaults: {},
      }),
    ],
    engine: createJavaScriptRegexEngine(),
  })
})

function HighlightedJson({ code }: { code: string }) {
  const html = () => {
    const h = highlighter()
    if (!h) {return null}
    return h.codeToHtml(code, {
      lang: 'json',
      theme: 'css-vars',
    })
  }

  return (
    <Show when={html()} fallback={<pre class='shiki-pre'>{code}</pre>}>
      {(markup) => <div innerHTML={markup()} />}
    </Show>
  )
}

function ScrapeViewer() {
  const params = new URLSearchParams(location.search)
  const logId = params.get('id')

  const [log] = createResource(async () => {
    if (!logId) {return null}
    const { events } = await chrome.storage.local.get({ events: [] })
    return (events as ScrapeLog[]).find((e) => e.id === logId) ?? null
  })

  return (
    <div class='bg-background text-foreground p-6 font-sans'>
      <Show when={log.loading}>
        <p class='text-muted-foreground text-sm'>Loading...</p>
      </Show>
      <Show when={!log.loading && !log()}>
        <p class='text-destructive text-sm'>Scrape not found.</p>
      </Show>
      <Show when={log()}>
        {(entry) => {
          const jsonStr = JSON.stringify(
            {
              patches: entry().patches,
              ...(entry().warnings.length > 0
                ? { warnings: entry().warnings }
                : {}),
            },
            null,
            2,
          )
          const serverResponseStr = () => {
            const raw = entry().serverResponse
            if (!raw) {return undefined}
            try {
              return JSON.stringify(JSON.parse(raw), null, 2)
            } catch {
              return raw
            }
          }

          return (
            <div class='max-w-4xl mx-auto flex flex-col gap-6'>
              <div class='flex items-start justify-between gap-4'>
                <div class='flex flex-col gap-1'>
                  <h1 class='text-lg font-semibold font-mono'>
                    {entry().source?.kind === 'network'
                      ? `network / ${entry().source.loader} / ${entry().source.file}`
                      : entry().source?.kind === 'html'
                        ? 'html'
                        : null}
                  </h1>
                  <p class='text-sm text-muted-foreground'>
                    {new Date(entry().date).toLocaleString()}
                  </p>
                </div>
                <Show
                  when={entry().httpStatus !== undefined}
                  fallback={
                    <span class='text-xs px-2 py-1 rounded-md bg-muted text-muted-foreground shrink-0'>
                      not sent
                    </span>
                  }
                >
                  <span
                    class={`text-xs px-2 py-1 rounded-md font-mono shrink-0 ${entry().status === 'submitted' ? 'bg-green-500/10 text-green-500' : 'bg-red-500/10 text-red-500'}`}
                  >
                    {entry().httpStatus}
                  </span>
                </Show>
              </div>

              <Show when={entry().serverResponse !== undefined}>
                <details class='border border-border rounded-md overflow-hidden group/response'>
                  <summary class='list-none cursor-pointer select-none flex items-center gap-2 px-3 py-2 text-xs font-medium'>
                    <svg
                      class='w-3 h-3 text-muted-foreground shrink-0 transition-transform group-open/response:rotate-90'
                      viewBox='0 0 12 12'
                      fill='currentColor'
                    >
                      <path
                        d='M4 2l4 4-4 4'
                        stroke='currentColor'
                        stroke-width='1.5'
                        fill='none'
                        stroke-linecap='round'
                        stroke-linejoin='round'
                      />
                    </svg>
                    <span class='text-muted-foreground uppercase tracking-wider'>
                      Server Response
                    </span>
                  </summary>
                  <div class='border-t border-border'>
                    <HighlightedJson code={serverResponseStr()!} />
                  </div>
                </details>
              </Show>

              <details
                class='border border-border rounded-md overflow-hidden group/payload'
                open
              >
                <summary class='list-none cursor-pointer select-none flex items-center gap-2 px-3 py-2 text-xs font-medium'>
                  <svg
                    class='w-3 h-3 text-muted-foreground shrink-0 transition-transform group-open/payload:rotate-90'
                    viewBox='0 0 12 12'
                    fill='currentColor'
                  >
                    <path
                      d='M4 2l4 4-4 4'
                      stroke='currentColor'
                      stroke-width='1.5'
                      fill='none'
                      stroke-linecap='round'
                      stroke-linejoin='round'
                    />
                  </svg>
                  <span class='text-muted-foreground uppercase tracking-wider'>
                    Patches
                  </span>
                  <span class='font-mono text-muted-foreground ml-auto'>
                    {entry().patches.length}
                  </span>
                </summary>
                <div class='border-t border-border'>
                  <HighlightedJson code={jsonStr} />
                </div>
              </details>
            </div>
          )
        }}
      </Show>
    </div>
  )
}

const root = document.getElementById('root')!
render(() => <ScrapeViewer />, root)
