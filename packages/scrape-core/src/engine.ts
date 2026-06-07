import { EntityValidator } from '@tide/spec'
import type { SiteDefinition, ScrapeResult } from '@tide/spec'
import { HtmlPageSource } from './page-source'
import { NetworkCapture } from './network-capture'
import type { NetworkTransport, ScrapeLogger } from './host'

export interface ScrapeEngine {
  start(): void
  stop(): void
  updateSites(sites: SiteDefinition[]): void
}

export interface ScrapeEngineOptions {
  document: Document
  /**
   * The resolved sites the engine is allowed to scrape. This is the consent
   * boundary: the engine runs only the funnels carried by the sites passed
   * here, so it cannot emit results for a site the caller has not opted into.
   * Callers MUST pass a pre-filtered list reflecting the user's opt-in state.
   * Sites are built (declaration + funnels) by @tide/sites; the engine only
   * consumes them.
   */
  sites: SiteDefinition[]
  logger: ScrapeLogger
  network: NetworkTransport
  origin: string
  onResult: (result: ScrapeResult) => void
}

export function createScrapeEngine(opts: ScrapeEngineOptions): ScrapeEngine {
  const { document, sites, logger, network, origin, onResult } = opts

  const validator = new EntityValidator(sites.map((s) => s.declaration))
  const pageFunnels = sites.flatMap((s) => s.getPageFunnels())
  const networkFunnels = sites.flatMap((s) => s.getNetworkFunnels())

  new NetworkCapture(sites, networkFunnels, network, origin, onResult)
  const page = new HtmlPageSource(
    document,
    pageFunnels,
    validator,
    logger,
    onResult,
  )

  return {
    start: () => page.start(),
    stop: () => page.stop(),
    updateSites: (next) =>
      page.updateRules(next.flatMap((s) => s.getPageFunnels())),
  }
}
