/* @refresh reload */
import { render } from 'solid-js/web'
import { Show, createResource } from 'solid-js'
import { createHighlighterCore, createCssVariablesTheme } from 'shiki/dist/core.mjs'
import { createJavaScriptRegexEngine } from 'shiki/dist/engine-javascript.mjs'
import type { ScrapeLog } from '~/shared'
import '@unocss/reset/tailwind-compat.css'
import 'virtual:uno.css'
import './app.css'
import './scrape-viewer.css'

function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return '? B'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function payloadBytes(payload: Record<string, unknown>): number {
  return new TextEncoder().encode(JSON.stringify(payload)).length
}

const [highlighter] = createResource(async () => {
  const [lang, theme] = await Promise.all([
    import('shiki/dist/langs/json.mjs'),
  ])
  return createHighlighterCore({
    langs: [lang.default],
    themes: [createCssVariablesTheme({ name: 'css-vars', variablePrefix: '--shiki-', variableDefaults: {} })],
    engine: createJavaScriptRegexEngine(),
  })
})

function HighlightedJson({ code }: { code: string }) {
  const html = () => {
    const h = highlighter()
    if (!h) return null
    return h.codeToHtml(code, {
      lang: 'json',
      theme: 'css-vars',
    })
  }

  return (
    <Show
      when={html()}
      fallback={
        <pre class='shiki-pre'>{code}</pre>
      }
    >
      {(markup) => <div innerHTML={markup()} />}
    </Show>
  )
}

function ScrapeViewer() {
  const params = new URLSearchParams(location.search)
  const logId = params.get('id')

  const [log] = createResource(async () => {
    if (!logId) return null
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
          const jsonStr = JSON.stringify({
            entity: entry().entity,
            variables: entry().variables,
            payload: entry().payload,
            ...(entry().warnings.length > 0 ? { warnings: entry().warnings } : {}),
          }, null, 2)
          const totalBytes = payloadBytes(entry().payload)
          const mediaEntries = Object.entries(entry().media ?? {})

          return (
            <div class='max-w-4xl mx-auto flex flex-col gap-6'>
              <div class='flex items-start justify-between gap-4'>
                <div class='flex flex-col gap-1'>
                  <h1 class='text-lg font-semibold'>{entry().entity}</h1>
                  <p class='text-sm text-muted-foreground'>{new Date(entry().date).toLocaleString()}</p>
                  <a href={entry().url} target='_blank' rel='noreferrer' class='text-xs text-muted-foreground font-mono hover:text-foreground transition-colors break-all'>{entry().url}</a>
                </div>
                <span class='text-xs px-2 py-1 rounded-md bg-muted text-muted-foreground shrink-0'>
                  not sent
                </span>
              </div>

              <Show when={mediaEntries.length > 0}>
                <details class='border border-border rounded-md overflow-hidden group/media'>
                  <summary class='list-none cursor-pointer select-none flex items-center gap-2 px-3 py-2 text-xs font-medium'>
                    <svg class='w-3 h-3 text-muted-foreground shrink-0 transition-transform group-open/media:rotate-90' viewBox='0 0 12 12' fill='currentColor'>
                      <path d='M4 2l4 4-4 4' stroke='currentColor' stroke-width='1.5' fill='none' stroke-linecap='round' stroke-linejoin='round'/>
                    </svg>
                    <span class='text-muted-foreground uppercase tracking-wider'>Media</span>
                    <span class='font-mono text-muted-foreground ml-auto'>
                      {mediaEntries.length} file{mediaEntries.length !== 1 ? 's' : ''} · {formatBytes(mediaEntries.reduce((sum, [, m]) => sum + m.bytes, 0))}
                    </span>
                  </summary>
                  <div class='flex flex-col divide-y divide-border border-t border-border'>
                    {mediaEntries.map(([hash, m]) => (
                      <div class='flex items-center gap-3 px-3 py-2 text-xs font-mono'>
                        <span class='text-muted-foreground truncate flex-1'>{hash}</span>
                        <span class='text-muted-foreground shrink-0'>{m.mimeType}</span>
                        <span class='shrink-0'>{formatBytes(m.bytes)}</span>
                      </div>
                    ))}
                  </div>
                </details>
              </Show>

              <details class='border border-border rounded-md overflow-hidden group/payload' open>
                <summary class='list-none cursor-pointer select-none flex items-center gap-2 px-3 py-2 text-xs font-medium'>
                  <svg class='w-3 h-3 text-muted-foreground shrink-0 transition-transform group-open/payload:rotate-90' viewBox='0 0 12 12' fill='currentColor'>
                    <path d='M4 2l4 4-4 4' stroke='currentColor' stroke-width='1.5' fill='none' stroke-linecap='round' stroke-linejoin='round'/>
                  </svg>
                  <span class='text-muted-foreground uppercase tracking-wider'>Payload</span>
                  <span class='font-mono text-muted-foreground ml-auto'>{formatBytes(totalBytes)}</span>
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
