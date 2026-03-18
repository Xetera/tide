import { createDateFormatter } from '@kobalte/core/i18n'
import { For, Show, createEffect, createSignal } from 'solid-js'
/* @refresh reload */
import { onMessage, sendMessage } from 'webext-bridge/popup'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '~/components/ui/tabs'
import { toOrigin } from '~/protocol/resource'
import type { Resource } from '~/protocol/scrapeer'
import { type BrowserStorageSchema, Storage } from '~/shared/storage'
import { useBrowserStorage } from '~/shared/hooks'
import { AddServer } from './add-server'
import { useLogs } from './hooks'
import { SchemaEditor } from './schema-editor'

const formatter = createDateFormatter({
  timeStyle: 'medium',
})()

async function requestNewPermissions(resource: Resource) {
  await chrome.permissions.request({
    origins: [toOrigin(resource)],
    permissions: ['declarativeNetRequest', 'webNavigation'],
  })
  // chrome.permissions.request({
  // })
}

function Page() {
  const storage = new Storage<BrowserStorageSchema>()
  const [state, setState] = createSignal<StatefulResource[]>([])
  const { logs } = useLogs()
  const { value: lastScrape } = useBrowserStorage<'scrape:last'>(
    'scrape:last',
    undefined,
  )
  async function updateState(resources: Resource[]) {
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

  function getNewPermissions(resource: Resource) {
    requestNewPermissions(resource)
    storage.push('enabledResources', resource.$id)
  }

  return (
    <div class='w-xl'>
      <Tabs defaultValue='dashboard'>
        <TabsList>
          <TabsTrigger value='dashboard'>Dashboard</TabsTrigger>
          <TabsTrigger value='schema'>Schema</TabsTrigger>
          <TabsTrigger value='settings'>Settings</TabsTrigger>
        </TabsList>
        <TabsContent value='dashboard'>
          <div class='flex flex-col items-start gap-2 p-3'>
            <For each={state()} fallback={'Nothing here!'}>
              {({ resource, hostAllowed }) => (
                <button
                  class='px-2 py-1'
                  type='button'
                  onClick={() => getNewPermissions(resource)}
                >
                  {hostAllowed ? '👍' : '👎'} {resource.$id}
                </button>
              )}
            </For>
          </div>
          <Show when={lastScrape()}>
            {(scrape) => (
              <details class='p-3' open>
                <summary class='cursor-pointer text-sm font-medium'>
                  Last scrape: {scrape().resourceId}
                </summary>
                <code class='mt-1 block whitespace-pre text-wrap text-xs'>
                  {JSON.stringify(scrape().payload, null, 2)}
                </code>
              </details>
            )}
          </Show>
          <div>
            <For each={logs()}>
              {(log) => (
                <div
                  data-index={log.id}
                  classList={{
                    'bg-red-100': log.severity === 'error',
                    'bg-green-100': log.severity === 'info',
                  }}
                >
                  {log.data ? (
                    <details>
                      <summary class='tabular-nums'>
                        {formatter.format(new Date(log.date))} {log.text}
                      </summary>
                      <code class='ml-2 whitespace-pre text-wrap'>
                        {JSON.stringify(log.data, null, 2)}
                      </code>
                    </details>
                  ) : (
                    <span class='ml-[10px] tabular-nums'>
                      {formatter.format(new Date(log.date))} {log.text}
                    </span>
                  )}
                </div>
              )}
            </For>
          </div>
        </TabsContent>
        <TabsContent value='schema'>
          <SchemaEditor />
        </TabsContent>
        <TabsContent value='settings'>
          <AddServer />
        </TabsContent>
      </Tabs>
    </div>
  )
}

export interface StatefulResource {
  hostAllowed: boolean
  resource: Resource
}

export default Page
