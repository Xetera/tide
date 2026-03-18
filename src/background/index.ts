import { TypedEmitter } from '~/shared/emitter'
import { onMessage, sendMessage } from 'webext-bridge/background'
import { Client, type ClientEvents } from '~/protocol/client'
import { ServerAutonomy } from '~/protocol/scrapeer'
import { generateUID } from '~/shared'
import { type BrowserStorageSchema, Storage } from '~/shared/storage'
import { log } from './backend-logger'
import { ContentScriptTracker } from './content-script-tracker'
import { addDisableChipsListener } from './cookie'
import { ScriptRegistry } from './dynamic-registry'
import {
  addIframeSecurityListener,
  disableIframeSecurity,
} from './iframe-security'
import { StorageListener } from './storage-listener'

const storage = new Storage<BrowserStorageSchema>()

function emitUrlUpdate(
  details: chrome.webNavigation.WebNavigationTransitionCallbackDetails,
) {
  if (details.parentDocumentId !== undefined) {
    // request sent from our iframe
    return
  }
  sendMessage('url-update', details.url, {
    context: 'content-script',
    tabId: details.tabId,
  })
}
;(async () => {
  const origins = ['webhook.site', 'instagram.com', 'www.sahibinden.com']
  try {
    const cst = new ContentScriptTracker()
    chrome.webNavigation.onHistoryStateUpdated.addListener(emitUrlUpdate, {
      url: origins.map((origin) => ({ hostContains: origin })),
    })

    const serverUrl = await storage.get('server:url', '')
    const serverName = await storage.get('server:name', '')
    const serverToken = await storage.get('server:token', '')
    const autonomy = await storage.get(
      'server:autonomy',
      ServerAutonomy.Passive,
    )

    const events = new TypedEmitter<ClientEvents>()
    const client = new Client({
      events,
      pollIntervalSeconds: 30,
      queueIntervalSeconds: 1,
      defaultServers: [
        {
          id: generateUID(),
          name: serverName,
          url: serverUrl,
          autonomy,
          token: serverToken,
        },
      ],
      async enabledResources(_server) {
        return storage.get('enabledResources', [])
      },
    })

    events.on('runJob', async (job) => {
      const tabId = await cst.getScriptTab(job.resource)
      log({
        text: `Running job: ${job.resource.id}`,
        severity: 'debug',
        data: { url: job.url.toString(), resourceId: job.resource.id, tabId },
      })
      console.log('[events] sending run-job event')
      console.log('parapsm', job.params)
      console.log(await chrome.tabs.query({}))
      try {
        await sendMessage('run-job', job.params, {
          context: 'content-script',
          tabId,
        })
      } catch (err) {
        if (err instanceof Error) {
          log({
            severity: 'error',
            text: 'Something went wrong while trying to run job',
            data: { message: err.message, tabId },
          })
        }
      }
    })
    // setTimeout(async () => {
    //   const id = await cst.getScriptTab(sahibinden)
    //   const params: JobParameters = {
    //     id: '1',
    //     issued_at: new Date(),
    //     expires_at: new Date(),
    //     resource_id: 'sahibinden:city_listing',
    //     url: 'https://www.sahibinden.com/satilik/istanbul',
    //   }
    //   const page = await sendMessage('run-job', params, {
    //     context: 'content-script',
    //     tabId: id,
    //   })
    //   console.log(page)
    // }, 5_000)

    events.on('updatedResources', async (server, resources) => {
      const tabIds = await cst.getAllScriptTabs()
      console.log('[events] updated resources')
      // sendMessage('update-resources', resources, {
      //   context: 'popup',
      //   tabId: 0,
      // })
      storage.set(
        'enabledResources',
        resources.map((resource) => resource.id),
      )
      ScriptRegistry.loadFromResources(resources)
      const hostnames = resources.map((re) => re.hostname)
      disableIframeSecurity(hostnames)
      for (const tabId of tabIds) {
        sendMessage('update-resources', resources, {
          context: 'content-script',
          tabId,
        })
      }
      chrome.webNavigation.onHistoryStateUpdated.removeListener(emitUrlUpdate)
      chrome.webNavigation.onHistoryStateUpdated.addListener(emitUrlUpdate, {
        url: resources.map((resource) => ({ hostContains: resource.hostname })),
      })
    })

    disableIframeSecurity(origins)
    addIframeSecurityListener()
    addDisableChipsListener(origins)

    onMessage('resources', async () => {
      console.log(chrome.runtime.lastError)
      console.log('got RESOURCES REQUQEST')
      console.log(client.allResources)
      return client.allResources
    })
    onMessage('page-match', ({ data }) => {
      try {
        console.log('scrape data', data)
        console.log(`Got a matching page for ${data.resourceId}`)
        storage.set('scrape:last', data)
        return events.emit('pageMatched', data)
      } catch (err) {
        console.error(err)
      }
    })

    onMessage('set-schema', ({ data }) => {
      storage.set('schema:local', JSON.stringify(data))
      client.setResources(client.getServer(), data)
    })
    onMessage('toggle-resource', () => {})
    onMessage('log', ({ data }) => {
      log(data)
    })

    const storageListener = new StorageListener()

    storageListener.on('server:token', (token) => {
      client.updateServer({ token })
    })

    storageListener.on('server:url', (url) => {
      client.updateServer({ url })
    })

    storageListener.on('server:enabled', (enabled) => {
      if (enabled) {
        log({
          severity: 'info',
          text: 'Server enabled, starting...',
        })
        client.start(client.getServer())
      } else {
        log({
          severity: 'info',
          text: 'Server disabled, stopping...',
        })
        client.stop(client.getServer())
      }
    })

    const localSchema = await storage.get('schema:local', '')
    if (localSchema) {
      try {
        client.setResources(client.getServer(), JSON.parse(localSchema))
      } catch {}
    }

    await client.startAll()
  } catch (err) {
    console.error(err)
  }
})()
