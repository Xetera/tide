import { createDateFormatter } from '@kobalte/core/i18n'
import { For, Show, createSignal } from 'solid-js'
/* @refresh reload */
import { Tabs, TabsContent, TabsList, TabsTrigger } from '~/components/ui/tabs'
import { Badge } from '~/components/ui/badge'
import { useBrowserStorage } from '~/shared/hooks'
import type { Log, PlainLog, ScrapeLog } from '~/shared/log'
import { AddServer } from './add-server'
import { useLogs } from './hooks'
import { Pool } from './pool'

const formatter = createDateFormatter({
  timeStyle: 'medium',
})()

function ScrapeLogEntry({ log }: { log: ScrapeLog }) {
  const time = formatter.format(new Date(log.date))
  const title =
    log.source?.kind === 'network'
      ? `${log.source.funnel} / ${log.source.file}`
      : [...new Set(log.patches.map((p) => p._entity))].join(', ')
  const patchesByEntity = Object.entries(
    log.patches.reduce<Record<string, number>>((acc, p) => {
      acc[p._entity] = (acc[p._entity] ?? 0) + 1
      return acc
    }, {}),
  )

  function openViewer() {
    chrome.tabs.create({
      url: chrome.runtime.getURL(`scrape-viewer.html?id=${log.id}`),
    })
  }

  function copyToClipboard() {
    const data = JSON.stringify(
      {
        patches: log.patches,
        ...(log.warnings.length > 0 ? { warnings: log.warnings } : {}),
      },
      null,
      2,
    )
    navigator.clipboard.writeText(data)
  }

  const statusClass = () => {
    if (log.status === 'submitted') return 's-log-ok'
    if (log.status === 'failed') return 's-log-err'
    return 's-log-mute'
  }

  return (
    <div data-index={log.id} class='s-log' style={{ display: 'block', padding: '0' }}>
      <details>
        <summary class='s-log cursor-pointer select-none' style={{ 'border-bottom': 'none' }}>
          <span class='s-log-time'>{time}</span>
          <span class='s-log-kind'>scrape</span>
          <span class='s-log-title'>{title}</span>
          <span class={`s-log-status ${statusClass()}`}>
            {log.status ?? 'pending'}
          </span>
        </summary>
        <div style={{ 'border-top': '1px solid var(--hairline)' }}>
          <div class='s-log' style={{ 'flex-direction': 'column', 'align-items': 'flex-start', 'border-bottom': 'none' }}>
            <span class='s-log-mute t-eyebrow'>patches</span>
            <div class='t-mono-xs flex flex-col gap-0.5'>
              {patchesByEntity.map(([entity, count]) => (
                <div class='flex gap-2'>
                  <span class='s-log-mute'>{entity}</span>
                  <span>{count}</span>
                </div>
              ))}
            </div>
          </div>
          <div class='flex gap-2' style={{ padding: '6px 16px 10px' }}>
            <button type='button' onClick={openViewer} class='s-btn s-btn-secondary s-btn-sm'>
              Open
            </button>
            <button type='button' onClick={copyToClipboard} class='s-btn s-btn-secondary s-btn-sm'>
              Copy
            </button>
          </div>
        </div>
      </details>
    </div>
  )
}

function PlainLogEntry({ log }: { log: Exclude<Log, ScrapeLog> }) {
  const time = formatter.format(new Date(log.date))

  const rowClass = () => {
    if (log.severity === 'error') return 's-log s-log-row-err'
    if (log.severity === 'warning') return 's-log s-log-row-warn'
    return 's-log'
  }

  return (
    <div data-index={log.id} class={rowClass()} style={{ display: 'block', padding: '0' }}>
      {log.data ? (
        <details>
          <summary class='s-log cursor-pointer select-none' style={{ 'border-bottom': 'none' }}>
            <span class='s-log-time'>{time}</span>
            <span class='s-log-title'>{log.text}</span>
          </summary>
          <code class='block t-mono-xs whitespace-pre text-wrap' style={{ padding: '4px 16px 10px' }}>
            {JSON.stringify(log.data, null, 2)}
          </code>
        </details>
      ) : (
        <div class='s-log' style={{ 'border-bottom': 'none' }}>
          <span class='s-log-time'>{time}</span>
          <span class='s-log-title'>{log.text}</span>
        </div>
      )}
    </div>
  )
}

function PoolLogs({ logs }: { logs: PlainLog[] }) {
  return (
    <details style={{ 'border-top': '1px solid var(--hairline)' }}>
      <summary class='s-log cursor-pointer select-none' style={{ 'border-bottom': 'none' }}>
        <span class='s-log-kind'>Pool logs</span>
        <span class='s-log-mute ml-auto'>{logs.length}</span>
      </summary>
      <div>
        <For each={logs}>{(log) => <PlainLogEntry log={log} />}</For>
      </div>
    </details>
  )
}

function Page() {
  const { logs } = useLogs()
  const scrapeLogs = () =>
    logs().filter((l): l is ScrapeLog => l.type === 'scrape')
  const poolLogs = () =>
    logs().filter(
      (l): l is PlainLog => l.type === 'plain' && l.scope === 'pool',
    )
  const { value: lastScrape } = useBrowserStorage<'scrape:last'>(
    'scrape:last',
    undefined,
  )

  const [tab, setTab] = createSignal('dashboard')

  return (
    <div class='w-[400px] bg-[var(--background)] text-[var(--foreground)] overflow-y-scroll'>
      <Tabs value={tab()} onChange={setTab}>
        <TabsList>
          <TabsTrigger value='dashboard'>Dashboard</TabsTrigger>
          <TabsTrigger value='pool'>Pool</TabsTrigger>
          <TabsTrigger value='settings'>Settings</TabsTrigger>
        </TabsList>

        <TabsContent value='dashboard'>
          <div class='flex flex-col'>
            <Show when={lastScrape()}>
              {(scrape) => (
                <div style={{ 'border-bottom': '1px solid var(--hairline)' }}>
                  <details>
                    <summary class='s-log cursor-pointer select-none' style={{ 'border-bottom': 'none' }}>
                      <span class='s-log-kind'>
                        Last scrape{scrape().scrapeSource ? ` · ${scrape().scrapeSource?.funnel}` : ''}
                      </span>
                      <Badge variant='muted' class='ml-auto shrink-0'>
                        {scrape().patches.length} patches
                      </Badge>
                    </summary>
                    <code class='block t-mono-xs whitespace-pre text-wrap' style={{ padding: '4px 16px 12px' }}>
                      {JSON.stringify(scrape().patches, null, 2)}
                    </code>
                  </details>
                </div>
              )}
            </Show>

            <div>
              {scrapeLogs().length === 0 && poolLogs().length === 0 && (
                <p class='t-muted text-center' style={{ padding: '24px 12px' }}>
                  No activity yet
                </p>
              )}
              <For each={scrapeLogs()}>
                {(log) => <ScrapeLogEntry log={log} />}
              </For>
              <Show when={poolLogs().length > 0}>
                <PoolLogs logs={poolLogs()} />
              </Show>
            </div>
          </div>
        </TabsContent>

        <TabsContent value='pool'>
          <Pool />
        </TabsContent>

        <TabsContent value='settings'>
          <AddServer />
        </TabsContent>
      </Tabs>
    </div>
  )
}

export default Page
