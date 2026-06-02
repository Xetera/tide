import { sendMessage } from 'webext-bridge/content-script'
import { allSites } from '~/sites'
import { funnelProvider } from '~/funnels/funnel-loader'
import { DebugUIManager } from '~/runtime/debug/debug-ui-manager'
import { HtmlPageSource } from '~/runtime/html-page-source'
import { NetworkCapture } from '~/content-scripts/network-capture'
import { EntityValidator } from '~/funnels/entity-validator'
import type { ScrapeResult } from '~/funnels/scrape-result'
import './stream-capture'

;(async () => {
  try {
    console.log('[tide] init', window.location.href)

    const { 'debug:visual': visualDebug } = await chrome.storage.local.get({
      'debug:visual': false,
    })

    const networkFunnels = allSites.flatMap((s) => {
      const funnels = s.getNetworkFunnels()
      for (const f of funnels) {
        console.log(
          `[tide] network funnel: ${s.hostname} "${f.name}" → ${f.request.url}`,
        )
      }
      return funnels
    })

    const debugUI = new DebugUIManager(networkFunnels)
    debugUI.setEnabled(visualDebug as boolean)

    chrome.storage.local.onChanged.addListener((changes) => {
      const change = changes['debug:visual']
      if (!change) {
        return
      }
      debugUI.setEnabled(change.newValue as boolean)
    })

    function onEmit(result: ScrapeResult) {
      sendMessage('entity-patches', result)
      debugUI.onScrapeResult(result)
    }

    chrome.runtime.onMessage.addListener((message) => {
      if (message?.type === 'url-update') {
        debugUI.clear()
        source.stop()
        source.start()
      }
      if (message?.type === 'update-resources') {
        source.updateRules(message.pageRules)
      }
    })

    console.group('[tide] running')
    console.log('[tide] injecting page source')
    const pageFunnels = allSites.flatMap((s) => s.getPageFunnels())
    console.log(
      '[tide] loaded sites',
      allSites.map((s) => s.hostname),
    )
    console.log(
      '[tide] loaded page funnels',
      pageFunnels.map((p) => p.url),
    )

    new NetworkCapture(allSites, networkFunnels, (result) => {
      sendMessage('entity-patches', result)
      debugUI.onScrapeResult(result)
    })
    const validator = new EntityValidator(allSites)
    const source = new HtmlPageSource(pageFunnels, validator, onEmit)
    source.start()

    if (import.meta.hot) {
      import.meta.hot.on(
        'tide:source-update',
        ({ path, content }: { path: string; content: string }) => {
          const changed = funnelProvider.patchEntry(path, content)
          if (!changed) {
            return
          }
          const updatedPageFunnels = allSites.flatMap((s) =>
            funnelProvider.getPageFunnelsForSite(s.id, s.hostname),
          )
          source.updateRules(updatedPageFunnels)
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
