import { HighlightManager } from './highlight-manager'
import type { ScrapeResult } from './page-rule-runner'
import type { NetworkLoader } from '~/site-spec/types'
import { allSites } from '~/sites'
import { scrapeSourceLoaderKey } from '~/shared'

export class DebugUIManager {
  #highlighter = new HighlightManager()
  #enabled = false
  #pageMatched = false
  #loaderFilePatchCounts = new Map<string, number>()
  #lastResult: ScrapeResult | null = null

  constructor(networkLoaders: NetworkLoader[]) {
    const loaderFiles = this.#matchingLoaderFiles(networkLoaders)
    this.#highlighter.setLoaderFiles(loaderFiles)
  }

  setEnabled(enabled: boolean): void {
    if (this.#enabled === enabled) {
      return
    }
    this.#enabled = enabled
    if (enabled) {
      if (!this.#pageMatched) {
        return
      }
      if (this.#lastResult) {
        this.#apply(this.#lastResult)
      } else {
        this.#highlighter.applyOrMount([], new Map(), [])
      }
    } else {
      this.#highlighter.clear()
    }
  }

  onScrapeResult(result: ScrapeResult): void {
    this.#pageMatched = true
    this.#lastResult = result
    if (result.scrapeSource) {
      this.#highlighter.setActiveLoader(scrapeSourceLoaderKey(result.scrapeSource))
      const key = scrapeSourceLoaderKey(result.scrapeSource)
      if (key !== null) {
        this.#loaderFilePatchCounts.set(key, (this.#loaderFilePatchCounts.get(key) ?? 0) + result.patches.length)
        this.#highlighter.updateLoaderFileCounts(this.#loaderFilePatchCounts)
      }
    }
    if (this.#enabled) {
      this.#apply(result)
    }
  }

  #apply(result: ScrapeResult): void {
    const errors = result.errors.map((e) => `${e.entity}${e.path}: ${e.message}`)
    this.#highlighter.applyOrMount(result.highlights, result.patchCounts, errors)
  }

  #matchingLoaderFiles(networkLoaders: NetworkLoader[]): Array<{ name: string; path: string; key: string; format: 'htmlevate' | 'jsonata' }> {
    const url = new URL(document.URL)
    const files: Array<{ name: string; path: string; key: string; format: 'htmlevate' | 'jsonata' }> = []
    for (const loader of networkLoaders) {
      if (url.hostname === loader.hostname) {
        files.push({ name: loader.name, path: loader.path, key: loader.key, format: loader.format })
      }
    }
    for (const site of allSites) {
      if (url.hostname !== site.hostname) {
        continue
      }
      for (const loader of site.getPageLoaders()) {
        if (loader.matchesUrl(url.pathname)) {
          files.push({ name: loader.name, path: loader.path, key: loader.key, format: loader.format })
        }
      }
    }
    return files
  }
}
