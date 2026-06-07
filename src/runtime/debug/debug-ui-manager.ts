import { HighlightManager } from './highlight-manager'
import { LegendOverlay } from './legend-overlay'
import type { ScrapeResult } from '@tide/spec'
import type { NetworkFunnelGroup, Funnel } from '@tide/spec'
import { scrapeSourceFunnelKey } from '~/shared/log'

export class DebugUIManager {
  #legend: LegendOverlay
  #highlighter: HighlightManager
  #enabled = false
  #lastResult: ScrapeResult | null = null
  #hasMatchingFunnels = false
  #knownSite = false
  #funnels: Funnel[] = []

  constructor(
    networkFunnels: NetworkFunnelGroup[],
    isOptedIn: boolean,
    knownSite: boolean,
    onOptIn: () => void,
  ) {
    this.#legend = new LegendOverlay(isOptedIn, onOptIn)
    this.#highlighter = new HighlightManager({
      opacity: () => this.#legend.opacity,
      isHidden: (entity) => this.#legend.isHidden(entity),
      onDraw: (hues, counts, errors) =>
        this.#legend.update(hues, counts, errors),
    })
    const matched = this.#matchingFunnels(networkFunnels)
    this.#hasMatchingFunnels = matched.length > 0
    this.#knownSite = knownSite
    this.#funnels = matched.flatMap((l) => l.funnels)
  }

  setOptedIn(value: boolean): void {
    this.#legend.setOptedIn(value)
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
      if (!this.#hasMatchingFunnels && !this.#knownSite) {
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
