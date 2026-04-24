import { createDateFormatter } from '@kobalte/core/i18n'
import { For, Show, createEffect, createSignal } from 'solid-js'
/* @refresh reload */
import { onMessage, sendMessage } from 'webext-bridge/popup'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '~/components/ui/tabs'
import { Badge } from '~/components/ui/badge'
import { toOrigin } from '~/site-spec/resource'
import type { PageSpec } from '~/site-spec/types'
import { type BrowserStorageSchema, Storage } from '~/shared/storage'
import { useBrowserStorage } from '~/shared/hooks'
import type { Log, PlainLog, ScrapeLog } from '~/shared'
import { AddServer } from './add-server'
import { useLogs } from './hooks'
import { SchemaEditor } from './schema-editor'
import { Pool } from './pool'
import { SpecGenerator } from './spec-generator'

const formatter = createDateFormatter({
  timeStyle: 'medium',
})()

async function requestNewPermissions(resource: PageSpec) {
  await chrome.permissions.request({
    origins: [toOrigin(resource)],
    permissions: ['declarativeNetRequest', 'webNavigation'],
  })
  // chrome.permissions.request({
  // })
}

function ResourceRow({
  resource,
  hostAllowed,
  onClick,
}: {
  resource: PageSpec
  hostAllowed: boolean
  onClick: () => void
}) {
  return (
    <button
      type='button'
      onClick={onClick}
      class='w-full flex items-center gap-2 px-3 py-2 rounded-md text-sm text-left transition-colors hover:bg-accent hover:text-accent-foreground'
    >
      <span
        class={`h-1.5 w-1.5 rounded-full shrink-0 ${hostAllowed ? 'bg-green-500' : 'bg-muted-foreground'}`}
      />
      <span class='flex-1 font-medium truncate'>{resource.$entity}</span>
      <Badge variant='muted'>{resource.$entity}</Badge>
    </button>
  )
}

function ScrapeLogEntry({ log }: { log: ScrapeLog }) {
  const time = formatter.format(new Date(log.date))
  const title =
    log.source?.kind === 'network'
      ? `${log.source.loader} / ${log.source.file}`
      : log.source?.kind === 'html'
        ? 'html'
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

  return (
    <div
      data-index={log.id}
      class='text-xs border-b border-border last:border-0 text-foreground'
    >
      <details>
        <summary class='cursor-pointer px-3 py-2 select-none flex items-center gap-2'>
          <span class='tabular-nums font-mono text-muted-foreground shrink-0'>
            {time}
          </span>
          <span class='font-medium'>scrape</span>
          <span class='text-muted-foreground truncate'>{title}</span>
          <span
            class={`ml-auto shrink-0 ${log.status === 'submitted' ? 'text-green-500' : log.status === 'failed' ? 'text-red-500' : 'text-muted-foreground'}`}
          >
            {log.status ?? 'pending'}
          </span>
        </summary>
        <div class='border-t border-border'>
          <div class='px-3 py-2'>
            <div class='text-muted-foreground mb-0.5'>patches</div>
            <div class='font-mono flex flex-col gap-0.5'>
              {patchesByEntity.map(([entity, count]) => (
                <div class='flex gap-2'>
                  <span class='text-muted-foreground'>{entity}</span>
                  <span>{count}</span>
                </div>
              ))}
            </div>
          </div>
          <div class='px-3 py-2 flex gap-2'>
            <button
              type='button'
              onClick={openViewer}
              class='px-2 py-1 rounded border border-border hover:bg-accent transition-colors'
            >
              Open
            </button>
            <button
              type='button'
              onClick={copyToClipboard}
              class='px-2 py-1 rounded border border-border hover:bg-accent transition-colors'
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
  return (
    <div
      data-index={log.id}
      class={`text-xs border-b border-border last:border-0 ${
        log.severity === 'error'
          ? 'bg-destructive/10 text-destructive'
          : log.severity === 'warning'
            ? 'bg-yellow-500/10 text-yellow-600 dark:text-yellow-400'
            : 'text-foreground'
      }`}
    >
      {log.data ? (
        <details>
          <summary class='cursor-pointer px-3 py-1.5 tabular-nums font-mono select-none'>
            <span class='text-muted-foreground mr-2'>{time}</span>
            {log.text}
          </summary>
          <code class='block px-3 pb-2 whitespace-pre text-wrap text-muted-foreground'>
            {JSON.stringify(log.data, null, 2)}
          </code>
        </details>
      ) : (
        <div class='px-3 py-1.5 tabular-nums font-mono'>
          <span class='text-muted-foreground mr-2'>{time}</span>
          {log.text}
        </div>
      )}
    </div>
  )
}

function LogEntry({ log }: { log: Log }) {
  if (log.type === 'scrape') {
    return <ScrapeLogEntry log={log} />
  }
  return <PlainLogEntry log={log} />
}

function PoolLogs({ logs }: { logs: PlainLog[] }) {
  return (
    <details class='border-t border-border'>
      <summary class='cursor-pointer px-3 py-2 text-xs font-medium text-muted-foreground select-none hover:bg-accent flex items-center justify-between'>
        <span>Pool logs</span>
        <span class='tabular-nums'>{logs.length}</span>
      </summary>
      <div>
        <For each={logs}>{(log) => <PlainLogEntry log={log} />}</For>
      </div>
    </details>
  )
}

function Page() {
  const storage = new Storage<BrowserStorageSchema>()
  const [state, setState] = createSignal<StatefulResource[]>([])
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

  async function updateState(resources: PageSpec[]) {
    const stateful = await Promise.all(
      resources.map(async (resource) => {
        const hostAllowed = await chrome.permissions.contains({
          origins: [toOrigin(resource)],
        })
        return { resource, hostAllowed }
      }),
    )
    setState(stateful)
  }

  createEffect(async () => {
    const resources = await sendMessage('resources', undefined, {
      context: 'background',
      tabId: 0,
    })
    updateState(resources)
  })

  onMessage('update-resources', async ({ data }) => {
    console.log('updated!!!', data)
    updateState(data)
  })

  // onMessage('ran-job', (a) => {
  //   console.log(a)
  // })

  function getNewPermissions(resource: PageSpec) {
    requestNewPermissions(resource)
    storage.push('enabledResources', resource.$entity)
  }

  const [tab, setTab] = createSignal('dashboard')

  return (
    <div class='w-[400px] bg-background text-foreground'>
      <Tabs value={tab()} onChange={setTab}>
        <TabsList class='w-full rounded-none border-b border-border bg-background h-10 p-0 gap-0'>
          <TabsTrigger
            value='dashboard'
            class='flex-1 h-full rounded-none border-b-2 border-transparent data-[selected]:(border-foreground bg-transparent) text-muted-foreground data-[selected]:text-foreground'
          >
            Dashboard
          </TabsTrigger>
          <TabsTrigger
            value='schema'
            class='flex-1 h-full rounded-none border-b-2 border-transparent data-[selected]:(border-foreground bg-transparent) text-muted-foreground data-[selected]:text-foreground'
          >
            Schema
          </TabsTrigger>
          <TabsTrigger
            value='pool'
            class='flex-1 h-full rounded-none border-b-2 border-transparent data-[selected]:(border-foreground bg-transparent) text-muted-foreground data-[selected]:text-foreground'
          >
            Pool
          </TabsTrigger>
          <TabsTrigger
            value='generate'
            class='flex-1 h-full rounded-none border-b-2 border-transparent data-[selected]:(border-foreground bg-transparent) text-muted-foreground data-[selected]:text-foreground'
          >
            Requests
          </TabsTrigger>
          <TabsTrigger
            value='settings'
            class='flex-1 h-full rounded-none border-b-2 border-transparent data-[selected]:(border-foreground bg-transparent) text-muted-foreground data-[selected]:text-foreground'
          >
            Settings
          </TabsTrigger>
        </TabsList>

        <TabsContent value='dashboard' class='mt-0'>
          <div class='flex flex-col'>
            <div class='border-b border-border'>
              <For
                each={state()}
                fallback={
                  <p class='px-3 py-6 text-sm text-muted-foreground text-center'>
                    No resources configured
                  </p>
                }
              >
                {({ resource, hostAllowed }) => (
                  <ResourceRow
                    resource={resource}
                    hostAllowed={hostAllowed}
                    onClick={() => getNewPermissions(resource)}
                  />
                )}
              </For>
            </div>

            <Show when={lastScrape()}>
              {(scrape) => (
                <div class='border-b border-border'>
                  <details class='group'>
                    <summary class='cursor-pointer flex items-center justify-between px-3 py-2 text-sm font-medium select-none hover:bg-accent'>
                      <span>Last scrape</span>
                      <Badge variant='outline'>
                        {scrape().patches.length} patches
                      </Badge>
                    </summary>
                    <code class='block px-3 pb-3 whitespace-pre text-wrap text-xs text-muted-foreground font-mono'>
                      {JSON.stringify(scrape().patches, null, 2)}
                    </code>
                  </details>
                </div>
              )}
            </Show>

            <div>
              {scrapeLogs().length === 0 && poolLogs().length === 0 && (
                <p class='px-3 py-6 text-sm text-muted-foreground text-center'>
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

        <TabsContent value='schema' class='mt-0'>
          <SchemaEditor />
        </TabsContent>

        <TabsContent value='pool' class='mt-0'>
          <Pool />
        </TabsContent>

        <TabsContent value='generate' class='mt-0'>
          <SpecGenerator />
        </TabsContent>

        <TabsContent value='settings' class='mt-0'>
          <AddServer />
        </TabsContent>
      </Tabs>
    </div>
  )
}

export interface StatefulResource {
  hostAllowed: boolean
  resource: PageSpec
}

export default Page
