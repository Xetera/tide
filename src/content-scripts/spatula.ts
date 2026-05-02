import { sendMessage } from 'webext-bridge/content-script'
import { allSites } from '~/sites'
import { HighlightManager } from '~/sources/highlight-manager'
import { HtmlPageSource } from '~/sources/html-page-source'
import { registerLoaders } from '~/sources/network-source'
import type { HtmlEvateLoader } from '~/site-spec/types'
import type { SourceEmission } from '~/sources/data-source'
import { matchesGlob } from '~/extraction/glob'
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
        highlighter.applyOrMount(source.lastHighlights, source.lastPatchCounts,
          source.lastErrors.map((e) => `${e.entity}${e.path}: ${e.message}`),
        )
      } else {
        highlighter.clear()
      }
    })

    const loaderFilePatchCounts = new Map<string, number>()

    function onEmit(emission: SourceEmission) {
      sendMessage('entity-patches', emission)
      const src = emission.scrapeSource
      if (!src) {
        return
      }
      let key: string | null = null
      if (src.kind === 'network') {
        key = `${src.loader}/${src.file}`
      } else if (src.kind === 'htmlevate-loader') {
        key = src.loader
      }
      if (key !== null) {
        loaderFilePatchCounts.set(key, (loaderFilePatchCounts.get(key) ?? 0) + emission.patches.length)
        highlighter.updateLoaderFileCounts(loaderFilePatchCounts)
      }
    }

    chrome.runtime.onMessage.addListener((message) => {
      if (message?.type === 'url-update') {
        source.stop()
        source.start()
      }
      if (message?.type === 'update-resources') {
        source.updateResources(message.resources, message.htmlevatePages)
      }
    })

    console.group('[spatula] running')
    console.log('[spatula] injecting page source')
    const defaultPages = allSites.flatMap((s) => s.getPages())
    const defaultHtmlevatePages = allSites.flatMap((s) => s.getHtmlevatePages())
    console.log(
      '[spatula] loaded sites',
      allSites.map((s) => s.hostname),
    )
    console.log(
      '[spatula] loaded pages',
      defaultPages.map((p) => p.$entity),
    )
    const defaultHtmlevateLoaders = allSites.flatMap((s) => {
      const loaders = s.getHtmlevateLoaders()
      for (const l of loaders) {
        console.log(`[spatula] htmlevate loader: ${s.hostname} "${l.name}" → ${l.urlPattern}`)
      }
      return loaders
    })
    function allMatchingLoaderFiles(htmlevateLoaders: HtmlEvateLoader[]) {
      const url = new URL(document.URL)
      const files: Array<{ name: string; path: string; format: 'htmlevate' | 'jsonata' }> = []
      for (const l of htmlevateLoaders) {
        if (l.path && url.hostname === l.hostname && matchesGlob(l.urlPattern, url.pathname)) {
          files.push({ name: l.name, path: l.path, format: 'htmlevate' })
        }
      }
      for (const site of allSites) {
        if (url.hostname !== site.hostname) {
          continue
        }
        for (const { name, path } of site.getJsonataLoaderFiles()) {
          files.push({ name, path, format: 'jsonata' })
        }
      }
      return files
    }

    registerLoaders(allSites)
    const source = new HtmlPageSource(defaultPages, defaultHtmlevatePages, defaultHtmlevateLoaders, allSites, onEmit)
    source.onHighlightsChanged = (highlights, patchCounts, errors) => {
      if (debugEnabled) {
        const errorMessages = errors.map((e) => `${e.entity}${e.path}: ${e.message}`)
        highlighter.apply(highlights, patchCounts, errorMessages)
      }
    }
    source.start()
    const loaderFiles = allMatchingLoaderFiles(defaultHtmlevateLoaders)
    highlighter.setLoaderFiles(loaderFiles)
    if (debugEnabled) {
      highlighter.applyOrMount(source.lastHighlights, source.lastPatchCounts,
        source.lastErrors.map((e) => `${e.entity}${e.path}: ${e.message}`),
        loaderFiles,
      )
    }

    if (import.meta.hot) {
      import.meta.hot.on('spatula:source-update', ({ path, content }: { path: string; content: string }) => {
        const changed = allSites.some((s) => s.patchSource(path, content))
        if (!changed) {
          return
        }
        const htmlevatePages = allSites.flatMap((s) => s.getHtmlevatePages())
        const htmlevateLoaders = allSites.flatMap((s) => s.getHtmlevateLoaders())
        source.updateResources(defaultPages, htmlevatePages, htmlevateLoaders)
        console.log(`[spatula] hot-reloaded: ${path}`)
      })
    }

    console.log('[spatula] page source running')
    console.groupEnd()
  } catch (err) {
    console.error(err)
  }
})()
