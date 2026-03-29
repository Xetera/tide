import { HighlightManager } from './highlight-manager'
import { PageManager } from './page-manager'
import './stream-capture'

;(async () => {
  try {
    console.log('[spatula] init', window.location.href)

    let manager: PageManager | undefined
    const highlighter = new HighlightManager()

    chrome.runtime.onMessage.addListener((message) => {
      if (message?.type === 'url-update') manager?.run()
      if (message?.type === 'update-resources' && manager) {
        manager.updateResourcesAndRun(document, message.resources)
      }
    })

    const { 'debug:visual': visualDebug } = await chrome.storage.local.get({
      'debug:visual': false,
    })
    let debugEnabled = visualDebug as boolean

    chrome.storage.local.onChanged.addListener((changes) => {
      const change = changes['debug:visual']
      if (!change) return
      debugEnabled = change.newValue as boolean
      if (debugEnabled) {
        highlighter.apply(manager?.lastHighlights ?? [])
      } else {
        highlighter.clear()
      }
    })

    console.group('[spatula] running')
    console.log('[spatula] getting resources from background...')
    const { 'resources:all': resources = [] } = await chrome.storage.local.get({
      'resources:all': [],
    })
    console.log('[spatula] injecting page manager')
    console.log('resources', resources)
    manager = new PageManager(document, resources)
    manager.onHighlightsChanged = (highlights) => {
      if (debugEnabled) {
        highlighter.apply(highlights)
      }
    }
    await manager.run()
    if (debugEnabled) {
      highlighter.apply(manager.lastHighlights)
    }

    console.log('[spatula] page manager running')
    console.groupEnd()
  } catch (err) {
    console.error(err)
  }
})()
