import {
  FunnelProvider,
  parseAllEntries,
  parseFixtures,
} from './funnel-loader'
export {
  FunnelProvider,
  captureMatchesKnownFunnel,
  matchesGlob,
} from './funnel-loader'
export type { PageFunnelEntry, NetworkFunnelEntry, FixtureEntry } from './funnel-loader'

console.log('loading vite!')
const rawJsonataModules = import.meta.glob('../sites/*/funnels/*.jsonata', {
  eager: true,
  query: '?raw',
  import: 'default',
}) as Record<string, string>

const rawHtmlegyModules = import.meta.glob('../sites/*/funnels/*.htmlegy', {
  eager: true,
  query: '?raw',
  import: 'default',
}) as Record<string, string>

const rawFixtureModules = import.meta.glob('../sites/*/funnels/*.json', {
  eager: true,
  import: 'default',
}) as Record<string, unknown>

const { page: pageEntries, network: networkEntries } = parseAllEntries(
  rawJsonataModules,
  rawHtmlegyModules,
)
export const funnelProvider = new FunnelProvider(
  pageEntries,
  networkEntries,
  parseFixtures(rawFixtureModules),
)

if (import.meta.hot) {
  import.meta.hot.on(
    'tide:source-update',
    ({ path, content }: { path: string; content: string }) => {
      funnelProvider.patchEntry(path, content)
    },
  )
}
