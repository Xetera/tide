import { createDateFormatter } from '@kobalte/core/i18n'
import { For, Show, createEffect, createMemo, createSignal, onMount } from 'solid-js'
import { sendMessage } from 'webext-bridge/popup'
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
    if (log.status === 'submitted') {
      return 'log-ok'
    }
    if (log.status === 'failed') {
      return 'log-err'
    }
    return 'log-mute'
  }

  return (
    <div
      data-index={log.id}
      class='log'
      style={{ display: 'block', padding: '0' }}
    >
      <details>
        <summary
          class='log cursor-pointer select-none'
          style={{ 'border-bottom': 'none' }}
        >
          <span class='log-time'>{time}</span>
          <span class='log-kind'>scrape</span>
          <span class='log-title'>{title}</span>
          <span class={`log-status ${statusClass()}`}>
            {log.status ?? 'pending'}
          </span>
        </summary>
        <div style={{ 'border-top': '1px solid var(--hairline)' }}>
          <div
            class='log'
            style={{
              'flex-direction': 'column',
              'align-items': 'flex-start',
              'border-bottom': 'none',
            }}
          >
            <span class='log-mute t-eyebrow'>patches</span>
            <div class='t-mono-xs flex flex-col gap-0.5'>
              {patchesByEntity.map(([entity, count]) => (
                <div class='flex gap-2'>
                  <span class='log-mute'>{entity}</span>
                  <span>{count}</span>
                </div>
              ))}
            </div>
          </div>
          <div class='flex gap-2' style={{ padding: '6px 16px 10px' }}>
            <button
              type='button'
              onClick={openViewer}
              class='btn btn-secondary btn-sm'
            >
              Open
            </button>
            <button
              type='button'
              onClick={copyToClipboard}
              class='btn btn-secondary btn-sm'
            >
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
    if (log.severity === 'error') {
      return 'log log-row-err'
    }
    if (log.severity === 'warning') {
      return 'log log-row-warn'
    }
    return 'log'
  }

  return (
    <div
      data-index={log.id}
      class={rowClass()}
      style={{ display: 'block', padding: '0' }}
    >
      {log.data ? (
        <details>
          <summary
            class='log cursor-pointer select-none'
            style={{ 'border-bottom': 'none' }}
          >
            <span class='log-time'>{time}</span>
            <span class='log-title'>{log.text}</span>
          </summary>
          <code
            class='block t-mono-xs whitespace-pre text-wrap'
            style={{ padding: '4px 16px 10px' }}
          >
            {JSON.stringify(log.data, null, 2)}
          </code>
        </details>
      ) : (
        <div class='log' style={{ 'border-bottom': 'none' }}>
          <span class='log-time'>{time}</span>
          <span class='log-title'>{log.text}</span>
        </div>
      )}
    </div>
  )
}

function PoolLogs({ logs }: { logs: PlainLog[] }) {
  return (
    <details style={{ 'border-top': '1px solid var(--hairline)' }}>
      <summary
        class='log cursor-pointer select-none'
        style={{ 'border-bottom': 'none' }}
      >
        <span class='log-kind'>Pool logs</span>
        <span class='log-mute ml-auto'>{logs.length}</span>
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

  const { value: serverUrl } = useBrowserStorage('server:url', '')
  const { value: poolId } = useBrowserStorage('server:pool-id', '')
  const { value: workerSecret } = useBrowserStorage('server:worker-secret', '')

  const hasCredentials = createMemo(
    () => !!(serverUrl() && poolId() && workerSecret()),
  )

  const { value: heartbeatEntry } = useBrowserStorage(
    'heartbeat:last',
    undefined,
  )
  const heartbeat = () => heartbeatEntry()?.status ?? null

  const HEARTBEAT_FRESHNESS_MS = 30_000
  createEffect(() => {
    if (!hasCredentials()) {
      return
    }
    const entry = heartbeatEntry()
    const fresh = entry && Date.now() - entry.at < HEARTBEAT_FRESHNESS_MS
    if (fresh) {
      return
    }
    sendMessage('heartbeat', undefined, {
      context: 'background',
      tabId: 0,
    }).catch(() => {})
  })

  const statusTone = () => {
    if (!hasCredentials()) {
      return 'pill-mute'
    }
    const hb = heartbeat()
    if (!hb) {
      return 'pill-mute'
    }
    if (hb.status === 'ok') {
      return 'pill-ok'
    }
    if (hb.status === 'unauthorized') {
      return 'pill-err'
    }
    return 'pill-warn'
  }

  const statusLabel = () => {
    if (!hasCredentials()) {
      return 'Not connected'
    }
    const hb = heartbeat()
    if (!hb) {
      return 'Checking...'
    }
    switch (hb.status) {
      case 'ok':
        return 'Connected'
      case 'unauthorized':
        return 'Unauthorized'
      case 'unconfigured':
        return 'Not connected'
      case 'unreachable':
        return 'Unreachable'
      case 'error':
        return `Server error (${hb.httpStatus})`
    }
  }

  const [tab, setTab] = createSignal('dashboard')

  onMount(async () => {
    const result = await chrome.storage.session.get('popup:initial-tab')
    const initial = result['popup:initial-tab'] as string | undefined
    if (initial) {
      await chrome.storage.session.remove('popup:initial-tab')
      setTab(initial)
    }
  })

  return (
    <div class='w-[400px] bg-[var(--background)] text-[var(--foreground)] overflow-y-scroll'>
      <div
        class='flex items-center justify-between'
        style={{
          padding: '10px 16px',
          'border-bottom': '1px solid var(--hairline)',
        }}
      >
        <span
          style={{
            font: '600 13px/1 var(--font-sans)',
            'letter-spacing': 'var(--letter-base)',
            color: 'var(--foreground)',
          }}
        >
          Tide
        </span>
        <span class={`pill ${statusTone()}`}>
          <span class='dot' />
          {statusLabel()}
        </span>
      </div>
      <Tabs value={tab()} onChange={setTab}>
        <TabsList>
          <TabsTrigger value='dashboard'>Activity</TabsTrigger>
          <TabsTrigger value='pool'>
            Pool
            <Show when={heartbeat()?.status === 'unauthorized'}>
              <span
                aria-label='Unauthorized'
                title='Unauthorized'
                class='inline-block ml-1.5 w-1.5 h-1.5 rounded-full bg-destructive'
              />
            </Show>
          </TabsTrigger>
          <TabsTrigger value='settings'>Settings</TabsTrigger>
          <button
            type='button'
            class='tab ml-auto'
            onClick={() =>
              chrome.tabs.create({
                url: chrome.runtime.getURL('playground.html'),
              })
            }
          >
            Playground
          </button>
        </TabsList>

        <TabsContent value='dashboard'>
          <div class='flex flex-col'>
            <Show when={lastScrape()}>
              {(scrape) => (
                <div style={{ 'border-bottom': '1px solid var(--hairline)' }}>
                  <details>
                    <summary
                      class='log cursor-pointer select-none'
                      style={{ 'border-bottom': 'none' }}
                    >
                      <span class='log-kind'>
                        Last scrape
                        {scrape().scrapeSource
                          ? ` · ${scrape().scrapeSource?.funnel}`
                          : ''}
                      </span>
                      <Badge variant='muted' class='ml-auto shrink-0'>
                        {scrape().patches.length} patches
                      </Badge>
                    </summary>
                    <code
                      class='block t-mono-xs whitespace-pre text-wrap'
                      style={{ padding: '4px 16px 12px' }}
                    >
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
          <Pool heartbeat={heartbeat()} />
        </TabsContent>

        <TabsContent value='settings'>
          <AddServer />
        </TabsContent>
      </Tabs>
    </div>
  )
}

export default Page
