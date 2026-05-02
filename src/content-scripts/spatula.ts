import { sendMessage } from 'webext-bridge/content-script'
import { allSites } from '~/sites'
import { HighlightManager } from '~/sources/highlight-manager'
import { HtmlPageSource } from '~/sources/html-page-source'
import { registerLoaders } from '~/sources/network-source'
import { patchSiteSource } from '~/site-spec/site-builder'
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
        const errorMessages = source.lastErrors.map((e) => `${e.entity}${e.path}: ${e.message}`)
        highlighter.apply(source.lastHighlights, source.lastPatchCounts, errorMessages)
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
        source.updateResources(message.resources, message.htmlevatePages)
      }
    })

    console.group('[spatula] running')
    console.log('[spatula] injecting page source')
    const defaultPages = allSites.flatMap((s) => s.pages)
    const defaultHtmlevatePages = allSites.flatMap((s) => s.htmlevatePages)
    console.log(
      '[spatula] loaded sites',
      allSites.map((s) => s.hostname),
    )
    console.log(
      '[spatula] loaded pages',
      defaultPages.map((p) => p.$entity),
    )
    const defaultHtmlevateLoaders: HtmlEvateLoader[] = []
    for (const site of allSites) {
      for (const [name, exprs] of Object.entries(site.loaders)) {
        const urlPattern = site.requests[name]?.url
        if (!urlPattern) {
          continue
        }
        for (const expr of exprs) {
          if (expr.format !== 'htmlevate') {
            continue
          }
          console.log(`[spatula] htmlevate loader: ${site.hostname} "${name}" → ${urlPattern}`)
          defaultHtmlevateLoaders.push({ name, hostname: site.hostname, urlPattern, source: expr.expression, path: `src/sites/${site.dir}/loaders/${expr.file}` })
        }
      }
    }
    function matchingLoaderFiles(loaders: HtmlEvateLoader[]) {
      const url = new URL(document.URL)
      return loaders
        .filter((l) => url.hostname === l.hostname && matchesGlob(l.urlPattern, url.pathname) && l.path)
        .map((l) => ({ name: l.name, path: l.path!, format: 'htmlevate' as const }))
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
    highlighter.setLoaderFiles(matchingLoaderFiles(defaultHtmlevateLoaders))
    if (debugEnabled) {
      const errorMessages = source.lastErrors.map((e) => `${e.entity}${e.path}: ${e.message}`)
      highlighter.apply(source.lastHighlights, source.lastPatchCounts, errorMessages)
    }

    if (import.meta.hot) {
      import.meta.hot.on('spatula:source-update', ({ path, content }: { path: string; content: string }) => {
        let changed = false
        for (const site of allSites) {
          if (patchSiteSource(site, path, content)) {
            changed = true
          }
        }
        if (!changed) {
          return
        }
        const htmlevatePages = allSites.flatMap((s) => s.htmlevatePages)
        const htmlevateLoaders: HtmlEvateLoader[] = []
        for (const site of allSites) {
          for (const [name, exprs] of Object.entries(site.loaders)) {
            const urlPattern = site.requests[name]?.url
            if (!urlPattern) {
              continue
            }
            for (const expr of exprs) {
              if (expr.format !== 'htmlevate') {
                continue
              }
              htmlevateLoaders.push({ name, hostname: site.hostname, urlPattern, source: expr.expression, path: `src/sites/${site.dir}/loaders/${expr.file}` })
            }
          }
        }
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
