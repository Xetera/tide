import { sendMessage } from 'webext-bridge/content-script'
import { allSites, funnelProvider } from '@tide/sites'
import { createScrapeEngine } from '@tide/scrape-core'
import type { ScrapeLogger, ScrapeResult } from '@tide/scrape-core'
import { DebugUIManager } from '~/runtime/debug/debug-ui-manager'
import { sendLog } from '~/runtime/debug/content-script-log'
import { chromeNetworkTransport } from '~/content-scripts/chrome-network-transport'
import './stream-capture'

;(async () => {
  try {
    console.log('[tide] init', window.location.href)

    const { 'debug:visual': visualDebug, 'sites:opted-in': optedIn } =
      await chrome.storage.local.get({
        'debug:visual': false,
        'sites:opted-in': [] as string[],
      })

    const optedInIds = optedIn as string[]
    const optedInSites = allSites.filter((s) => optedInIds.includes(s.id))

    const networkFunnels = allSites.flatMap((s) => s.getNetworkFunnels())

    const currentHostname = window.location.hostname
    const currentSite = allSites.find((s) => s.hostname === currentHostname)
    const isOptedIn =
      currentSite !== undefined && optedInIds.includes(currentSite.id)

    function onOptIn() {
      chrome.runtime.sendMessage({ type: 'open-popup', hostname: currentSite?.hostname })
    }

    const debugUI = new DebugUIManager(networkFunnels, isOptedIn, currentSite !== undefined, onOptIn)
    debugUI.setEnabled(visualDebug as boolean)

    chrome.storage.local.onChanged.addListener((changes) => {
      const change = changes['debug:visual']
      if (!change) {
        return
      }
      debugUI.setEnabled(change.newValue as boolean)
    })

    function onResult(result: ScrapeResult) {
      const { highlights: _highlights, patchCounts: _patchCounts, ...serializable } =
        result
      sendMessage('entity-patches', serializable)
      debugUI.onScrapeResult(result)
    }

    const logger: ScrapeLogger = {
      log: (entry) =>
        sendLog({
          severity: entry.severity,
          text: entry.text,
          data: entry.data as Record<string, unknown> | undefined,
        }),
    }

    const engine = createScrapeEngine({
      document,
      sites: optedInSites,
      logger,
      network: chromeNetworkTransport,
      origin: window.location.origin,
      onResult,
    })

    chrome.runtime.onMessage.addListener((message) => {
      if (message?.type === 'url-update') {
        debugUI.clear()
        engine.stop()
        engine.start()
      }
    })

    console.group('[tide] running')
    console.log(
      '[tide] loaded sites',
      allSites.map((s) => s.hostname),
    )
    console.log(
      '[tide] opted-in sites',
      optedInSites.map((s) => s.hostname),
    )

    engine.start()

    if (import.meta.hot) {
      import.meta.hot.on(
        'tide:source-update',
        ({ path, content }: { path: string; content: string }) => {
          const changed = funnelProvider.patchEntry(path, content)
          if (!changed) {
            return
          }
          const reresolved = funnelProvider.resolveSites(
            optedInSites.map((s) => s.declaration),
          )
          engine.updateSites(reresolved)
          console.log(`[tide] hot-reloaded: ${path}`)
        },
      )
    }

    console.log('[tide] page source running')
    console.groupEnd()
  } catch (err) {
    console.error(err)
  }
})()
