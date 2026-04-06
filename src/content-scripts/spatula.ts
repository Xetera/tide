import { sendMessage } from 'webext-bridge/content-script'
import { allSites } from '~/sites'
import { HighlightManager } from '~/sources/highlight-manager'
import { HtmlPageSource } from '~/sources/html-page-source'
import { registerLoaders } from '~/sources/network-source'
import type { SourceEmission } from '~/sources/data-source'
import './stream-capture'

;(async () => {
  try {
    console.log('[spatula] init', window.location.href)

    const highlighter = new HighlightManager()

    const { 'debug:visual': visualDebug } = await chrome.storage.local.get({
      'debug:visual': false,
    })
    let debugEnabled = visualDebug as boolean

    chrome.storage.local.onChanged.addListener((changes) => {
      const change = changes['debug:visual']
      if (!change) {
        return
      }
      debugEnabled = change.newValue as boolean
      if (debugEnabled) {
        highlighter.apply(source.lastHighlights)
      } else {
        highlighter.clear()
      }
    })

    function onEmit(emission: SourceEmission) {
      sendMessage('entity-patches', emission)
    }

    chrome.runtime.onMessage.addListener((message) => {
      if (message?.type === 'url-update') {
        source.stop()
        source.start()
      }
      if (message?.type === 'update-resources') {
        source.updateResources(message.resources)
      }
    })

    console.group('[spatula] running')
    console.log('[spatula] injecting page source')
    const defaultPages = allSites.flatMap((s) => s.pages)
    console.log('[spatula] loaded sites', allSites.map((s) => s.hostname))
    console.log('[spatula] loaded pages', defaultPages.map((p) => p.$entity))
    registerLoaders(allSites)
    const source = new HtmlPageSource(defaultPages, onEmit)
    source.onHighlightsChanged = (highlights) => {
      if (debugEnabled) {
        highlighter.apply(highlights)
      }
    }
    source.start()
    if (debugEnabled) {
      highlighter.apply(source.lastHighlights)
    }

    console.log('[spatula] page source running')
    console.groupEnd()
  } catch (err) {
    console.error(err)
  }
})()
