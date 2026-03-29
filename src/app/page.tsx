import { createDateFormatter } from '@kobalte/core/i18n'
import { For, Show, createEffect, createSignal } from 'solid-js'
/* @refresh reload */
import { onMessage, sendMessage } from 'webext-bridge/popup'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '~/components/ui/tabs'
import { Badge } from '~/components/ui/badge'
import { toOrigin } from '~/protocol/resource'
import type { PageSpec } from '~/protocol/scrapeer'
import { type BrowserStorageSchema, Storage } from '~/shared/storage'
import { useBrowserStorage } from '~/shared/hooks'
import type { Log, ScrapeLog } from '~/shared'
import { AddServer } from './add-server'
import { useLogs } from './hooks'
import { SchemaEditor } from './schema-editor'
import { Pool } from './pool'

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
      <span class='flex-1 font-medium truncate'>{resource.$id}</span>
      <Badge variant='muted'>{resource.$entity}</Badge>
    </button>
  )
}

function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return '? B'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function ScrapeLogEntry({ log }: { log: ScrapeLog }) {
  const time = formatter.format(new Date(log.date))
  const payloadBytes = new TextEncoder().encode(JSON.stringify(log.payload)).length
  const mediaEntries = Object.entries(log.media ?? {})
  const mediaBytes = mediaEntries.reduce((sum, [, m]) => sum + m.bytes, 0)

  function openViewer() {
    chrome.tabs.create({
      url: chrome.runtime.getURL(`scrape-viewer.html?id=${log.id}`),
    })
  }

  function copyToClipboard() {
    const data = JSON.stringify(
      {
        entity: log.entity,
        variables: log.variables,
        payload: log.payload,
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
          <span class='tabular-nums font-mono text-muted-foreground shrink-0'>{time}</span>
          <span class='font-medium'>scrape</span>
          <span class='text-muted-foreground truncate'>{log.entity}</span>
          <span class='ml-auto text-muted-foreground shrink-0'>not sent</span>
        </summary>
        <div class='border-t border-border'>
          <div class='grid grid-cols-2 divide-x divide-border border-b border-border'>
            <div class='px-3 py-2'>
              <div class='text-muted-foreground mb-0.5'>payload</div>
              <div class='font-mono'>{formatBytes(payloadBytes)}</div>
            </div>
            <Show
              when={mediaEntries.length > 0}
              fallback={
                <div class='px-3 py-2'>
                  <div class='text-muted-foreground mb-0.5'>media</div>
                  <div class='text-muted-foreground'>none</div>
                </div>
              }
            >
              <details class='group'>
                <summary class='px-3 py-2 cursor-pointer select-none list-none'>
                  <div class='text-muted-foreground mb-0.5'>
                    media
                    <span class='ml-1 text-foreground'>{mediaEntries.length}</span>
                  </div>
                  <div class='font-mono'>{formatBytes(mediaBytes)}</div>
                </summary>
                <div class='border-t border-border divide-y divide-border col-span-2'>
                  <For each={mediaEntries}>
                    {([hash, m]) => (
                      <div class='px-3 py-1.5 flex items-center gap-2 font-mono'>
                        <span class='text-muted-foreground truncate flex-1'>{hash}</span>
                        <span class='text-muted-foreground shrink-0'>{m.mimeType.replace('image/', '')}</span>
                        <span class='shrink-0'>{formatBytes(m.bytes)}</span>
                      </div>
                    )}
                  </For>
                </div>
              </details>
            </Show>
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

function Page() {
  const storage = new Storage<BrowserStorageSchema>()
  const [state, setState] = createSignal<StatefulResource[]>([])
  const { logs } = useLogs()
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
    storage.push('enabledResources', resource.$id)
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
                      <Badge variant='outline'>{scrape().resourceId}</Badge>
                    </summary>
                    <code class='block px-3 pb-3 whitespace-pre text-wrap text-xs text-muted-foreground font-mono'>
                      {JSON.stringify(scrape().payload, null, 2)}
                    </code>
                  </details>
                </div>
              )}
            </Show>

            <div>
              {logs().length === 0 && (
                <p class='px-3 py-6 text-sm text-muted-foreground text-center'>
                  No activity yet
                </p>
              )}
              <For each={logs()}>{(log) => <LogEntry log={log} />}</For>
            </div>
          </div>
        </TabsContent>

        <TabsContent value='schema' class='mt-0'>
          <SchemaEditor />
        </TabsContent>

        <TabsContent value='pool' class='mt-0'>
          <Pool />
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
