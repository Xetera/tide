import {
  FunnelProvider,
  parseAllEntries,
  parseFixtures,
} from '@tide/spec'
import type { SiteDeclaration, SiteDefinition } from '@tide/spec'
export {
  FunnelProvider,
  captureMatchesKnownFunnel,
  matchesGlob,
} from '@tide/spec'
export type { PageFunnelEntry, NetworkFunnelEntry, FixtureEntry } from '@tide/spec'

const rawJsonataModules = import.meta.glob('./sites/*/funnels/*.jsonata', {
  eager: true,
  query: '?raw',
  import: 'default',
}) as Record<string, string>

const rawHtmlegyModules = import.meta.glob('./sites/*/funnels/*.htmlegy', {
  eager: true,
  query: '?raw',
  import: 'default',
}) as Record<string, string>

const rawFixtureModules = import.meta.glob('./sites/*/funnels/*.json', {
  eager: true,
  import: 'default',
}) as Record<string, unknown>

const siteModules = import.meta.glob('./sites/*/index.ts', {
  import: 'default',
  eager: true,
}) as Record<string, SiteDeclaration>

const { page: pageEntries, network: networkEntries } = parseAllEntries(
  rawJsonataModules,
  rawHtmlegyModules,
)
export const funnelProvider = new FunnelProvider(
  pageEntries,
  networkEntries,
  parseFixtures(rawFixtureModules),
)

const declarations: SiteDeclaration[] = Object.values(siteModules)
export const allSites: SiteDefinition[] =
  funnelProvider.resolveSites(declarations)

if (import.meta.hot) {
  import.meta.hot.on(
    'tide:source-update',
    ({ path, content }: { path: string; content: string }) => {
      const patched = funnelProvider.patchEntry(path, content)
      if (!patched) {
        funnelProvider.addEntry(path, content)
      }
    },
  )
  import.meta.hot.on('tide:source-remove', ({ path }: { path: string }) => {
    funnelProvider.removeEntry(path)
  })
}
