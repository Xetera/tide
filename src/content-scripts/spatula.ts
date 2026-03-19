import { onMessage, sendMessage } from 'webext-bridge/content-script'
import { HighlightManager } from './highlight-manager'
import { PageManager } from './page-manager'
import './stream-capture'

;(async () => {
  try {
    console.log('[spatula] init', window.location.href)
    sendMessage('start', undefined, { context: 'background', tabId: 0 })

    let manager: PageManager | undefined
    const highlighter = new HighlightManager()

    onMessage('url-update', () => manager?.run())
    onMessage('toggle-highlight', () => {
      if (manager) {
        highlighter.toggle(manager.lastHighlights)
      }
    })
    onMessage('update-resources', ({ data }) => {
      if (manager) {
        manager.updateResourcesAndRun(document, data)
      }
    })

    console.group('[spatula] running')
    console.log('[spatula] getting resources from background...')
    const resources = await sendMessage('resources', void 0, 'background')
    console.log('[spatula] injecting page manager')
    manager = new PageManager(document, resources)
    manager.onHighlightsChanged = (highlights) => {
      if (highlighter.active) {
        highlighter.apply(highlights)
      }
    }
    await manager.run()
    highlighter.apply(manager.lastHighlights)

    console.log('[spatula] page manager running')
    console.groupEnd()
  } catch (err) {
    console.error(err)
  }
})()
