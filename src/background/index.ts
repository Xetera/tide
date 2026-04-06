import { onMessage, sendMessage } from 'webext-bridge/background'
import { Client } from '~/server/client'
import { ServerAutonomy, type PageSpec } from '~/site-spec/types'
import { instagramSite } from '~/sites/instagram'
import { generateUID } from '~/shared'
import { type BrowserStorageSchema, Storage } from '~/shared/storage'
import { log } from './backend-logger'
import { ContentScriptTracker } from './content-script-tracker'
import { addDisableChipsListener } from './cookie'
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
  chrome.tabs.sendMessage(details.tabId, { type: 'url-update', url: details.url }).catch(() => {})
}
;(async () => {
  const origins = ['webhook.site', 'instagram.com', 'www.sahibinden.com']
  let client: Client | undefined

  try {
    const cst = new ContentScriptTracker()
    chrome.webNavigation.onHistoryStateUpdated.addListener(emitUrlUpdate, {
      url: origins.map((origin) => ({ hostContains: origin })),
    })

    const serverUrl = await storage.get('server:url', '')
    const serverName = await storage.get('server:name', '')
    const poolId = await storage.get('server:pool-id', '')
    const autonomy = await storage.get('server:autonomy', ServerAutonomy.Passive)

    let workerId = await storage.get('server:worker-id', '')
    if (!workerId) {
      workerId = crypto.randomUUID()
      await storage.set('server:worker-id', workerId)
    }

    const workerSecret = await storage.get('server:worker-secret', '')

    client = new Client({
      cst,
      pollIntervalSeconds: 30,
      queueIntervalSeconds: 1,
      defaultServers: [
        {
          id: generateUID(),
          name: serverName,
          url: serverUrl,
          autonomy,
          poolId,
          workerId,
          workerSecret,
        },
      ],
      async enabledResources(_server) {
        return storage.get('enabledResources', [])
      },
      onPatches(emission) {
        storage.set('scrape:last', emission)
      },
      async onResourcesUpdated(server, resources) {
        const tabIds = await cst.getAllScriptTabs()
        storage.set(
          'enabledResources',
          resources.map((resource) => resource.$entity),
        )
        storage.set('resources:all', resources)
        const hostnames = resources.map((re) => re.$hostname)
        disableIframeSecurity(hostnames)
        for (const tabId of tabIds) {
          chrome.tabs.sendMessage(tabId, { type: 'update-resources', resources }).catch(() => {})
        }
        chrome.webNavigation.onHistoryStateUpdated.removeListener(emitUrlUpdate)
        chrome.webNavigation.onHistoryStateUpdated.addListener(emitUrlUpdate, {
          url: resources.map((resource) => ({
            hostContains: resource.$hostname,
          })),
        })
      },
    })

    disableIframeSecurity(origins)
    addIframeSecurityListener()
    addDisableChipsListener(origins)

    onMessage('set-schema', ({ data }) => {
      storage.set('schema:local', JSON.stringify(data))
      storage.set('resources:all', data)
      client!.setResources(client!.getServer(), data)
    })
    onMessage('toggle-resource', () => {})
    onMessage('log', ({ data }) => {
      log(data)
    })

    const storageListener = new StorageListener()

    storageListener.on('server:worker-secret', (workerSecret) => {
      client!.updateServer({ workerSecret })
    })

    storageListener.on('server:pool-id', (poolId) => {
      client!.updateServer({ poolId })
    })

    storageListener.on('server:url', (url) => {
      client!.updateServer({ url })
    })

    storageListener.on('server:enabled', (enabled) => {
      if (enabled) {
        log({
          severity: 'info',
          text: 'Server enabled, starting...',
        })
        client!.start(client!.getServer())
      } else {
        log({
          severity: 'info',
          text: 'Server disabled, stopping...',
        })
        client!.stop(client!.getServer())
      }
    })

    const localSchema = await storage.get('schema:local', '')
    const defaultResources = instagramSite.pages
    const resources: PageSpec[] = localSchema
      ? (() => { try { return JSON.parse(localSchema) } catch { return defaultResources } })()
      : defaultResources
    client.setResources(client.getServer(), resources)
    storage.set('resources:all', resources)

    await client.startAll()
  } catch (err) {
    console.error(err)
  }
})()
