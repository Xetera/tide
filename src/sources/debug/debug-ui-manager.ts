import { HighlightManager } from './highlight-manager'
import { LegendOverlay } from './legend-overlay'
import type { ScrapeResult } from '~/extraction/scrape-result'
import type { NetworkFunnelGroup, Funnel } from '~/site-spec/types'
import { scrapeSourceFunnelKey } from '~/shared/log'

export class DebugUIManager {
  #legend = new LegendOverlay()
  #highlighter = new HighlightManager({
    opacity: () => this.#legend.opacity,
    isHidden: (entity) => this.#legend.isHidden(entity),
    onDraw: (hues, counts, errors) => this.#legend.update(hues, counts, errors),
  })
  #enabled = false
  #lastResult: ScrapeResult | null = null
  #hasMatchingFunnels = false
  #funnels: Funnel[] = []

  constructor(networkFunnels: NetworkFunnelGroup[]) {
    const matched = this.#matchingFunnels(networkFunnels)
    this.#hasMatchingFunnels = matched.length > 0
    this.#funnels = matched.flatMap((l) => l.funnels)
  }

  clear(): void {
    this.#lastResult = null
    this.#highlighter.clear()
    this.#legend.setActiveFunnel(null)
  }

  setEnabled(enabled: boolean): void {
    if (this.#enabled === enabled) {
      return
    }
    this.#enabled = enabled
    if (enabled) {
      if (!this.#hasMatchingFunnels) {
        return
      }
      if (this.#lastResult) {
        this.#applyHighlights(this.#lastResult)
      } else {
        void this.#legend.mount().then(() => {
          this.#legend.setNetworkFunnels(this.#funnels)
          this.#legend.update(new Map(), new Map(), [])
        })
      }
    } else {
      this.#highlighter.clear()
      this.#legend.unmount()
    }
  }

  onScrapeResult(result: ScrapeResult): void {
    if (result.scrapeSource?.kind !== 'network') {
      this.#lastResult = result
    }
    if (result.scrapeSource) {
      const key = scrapeSourceFunnelKey(result.scrapeSource)
      if (result.scrapeSource.kind === 'network') {
        void this.#legend.mount().then(() => {
          this.#legend.setNetworkFunnels(this.#funnels)
          this.#legend.setActiveFunnel(key)
          if (key !== null) {
            this.#legend.recordResult(key, result.patches.length)
          }
          this.#legend.openNetworkFiles()
        })
      } else {
        this.#legend.setActiveFunnel(key)
      }
    }
    if (this.#enabled && result.scrapeSource?.kind !== 'network') {
      this.#applyHighlights(result)
    }
  }

  #applyHighlights(result: ScrapeResult): void {
    const errors = result.errors.map(
      (e) => `${e.entity}${e.path}: ${e.message}`,
    )
    if (result.highlights.length > 0) {
      this.#highlighter.apply(result.highlights, result.patchCounts, errors)
      void this.#legend.mount().then(() => {
        this.#legend.onRedraw = () => this.#highlighter.scheduleRedraw()
        this.#legend.setNetworkFunnels(this.#funnels)
      })
    } else {
      void this.#legend.mount().then(() => {
        this.#legend.setNetworkFunnels(this.#funnels)
        this.#legend.update(new Map(), new Map(), errors)
      })
    }
  }

  #matchingFunnels(networkFunnels: NetworkFunnelGroup[]): NetworkFunnelGroup[] {
    const url = new URL(document.URL)
    const files: NetworkFunnelGroup[] = []
    for (const group of networkFunnels) {
      if (url.hostname === group.hostname) {
        files.push(group)
      }
    }
    return files
  }
}
