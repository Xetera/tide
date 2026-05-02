import { sendMessage } from 'webext-bridge/content-script'
import { allSites } from '~/sites'
import { loaderProvider } from '~/loaders'
import { DebugUIManager } from '~/sources/debug-ui-manager'
import { HtmlPageSource } from '~/sources/html-page-source'
import { registerLoaders } from '~/sources/network-source'
import { EntityValidator } from '~/extraction/entity-validator'
import type { ScrapeResult } from '~/sources/page-rule-runner'
import './stream-capture'

;(async () => {
  try {
    console.log('[spatula] init', window.location.href)

    const { 'debug:visual': visualDebug } = await chrome.storage.local.get({
      'debug:visual': false,
    })

    const networkLoaders = allSites.flatMap((s) => {
      const loaders = s.getNetworkLoaders()
      for (const l of loaders) {
        console.log(
          `[spatula] network loader: ${s.hostname} "${l.name}" → ${l.urlPattern}`,
        )
      }
      return loaders
    })

    const debugUI = new DebugUIManager(networkLoaders)
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
        source.stop()
        source.start()
      }
      if (message?.type === 'update-resources') {
        source.updateRules(message.pageRules)
      }
    })

    console.group('[spatula] running')
    console.log('[spatula] injecting page source')
    console.log('allsides', allSites)
    const pageLoaders = allSites.flatMap((s) => s.getPageLoaders())
    console.log(
      '[spatula] loaded sites',
      allSites.map((s) => s.hostname),
    )
    console.log(
      '[spatula] loaded page loaders',
      pageLoaders.map((p) => p.urlPattern),
    )

    registerLoaders(allSites)
    const validator = new EntityValidator(allSites)
    const source = new HtmlPageSource(pageLoaders, validator, onEmit)
    source.start()

    if (import.meta.hot) {
      import.meta.hot.on(
        'spatula:source-update',
        ({ path, content }: { path: string; content: string }) => {
          const changed = loaderProvider.patchEntry(path, content)
          if (!changed) {
            return
          }
          const updatedPageLoaders = allSites.flatMap((s) => s.getPageLoaders())
          source.updateRules(updatedPageLoaders)
          console.log(`[spatula] hot-reloaded: ${path}`)
        },
      )
    }

    console.log('[spatula] page source running')
    console.groupEnd()
  } catch (err) {
    console.error(err)
  }
})()
