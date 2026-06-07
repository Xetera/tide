import { readFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import fg from 'fast-glob'
import { FunnelProvider, parseAllEntries, parseFixtures } from '@tide/spec'
import type { SiteDeclaration, SiteDefinition } from '@tide/spec'
export {
  FunnelProvider,
  captureMatchesKnownFunnel,
  matchesGlob,
} from '@tide/spec'
export type { PageFunnelEntry, NetworkFunnelEntry, FixtureEntry } from '@tide/spec'

const _base = dirname(fileURLToPath(import.meta.url))

function rawGlob(patterns: string[]): Record<string, string> {
  const result: Record<string, string> = {}
  for (const pattern of patterns) {
    for (const file of fg.sync(pattern, { cwd: _base, absolute: true })) {
      result['./' + file.slice(_base.length + 1)] = readFileSync(file, 'utf8')
    }
  }
  return result
}

function jsonGlob(patterns: string[]): Record<string, unknown> {
  const result: Record<string, unknown> = {}
  for (const pattern of patterns) {
    for (const file of fg.sync(pattern, { cwd: _base, absolute: true })) {
      result['./' + file.slice(_base.length + 1)] = JSON.parse(readFileSync(file, 'utf8'))
    }
  }
  return result
}

const rawJsonataModules = rawGlob(['sites/*/funnels/*.jsonata'])

const rawHtmlegyModules = rawGlob(['sites/*/funnels/*.htmlegy'])

const rawFixtureModules = jsonGlob(['sites/*/funnels/*.json'])

const { page: pageEntries, network: networkEntries } = parseAllEntries(
  rawJsonataModules,
  rawHtmlegyModules,
)
export const funnelProvider = new FunnelProvider(
  pageEntries,
  networkEntries,
  parseFixtures(rawFixtureModules),
)

const declarations: SiteDeclaration[] = await Promise.all(
  fg
    .sync('sites/*/index.ts', { cwd: _base, absolute: true })
    .map((file) =>
      import(pathToFileURL(file).href).then(
        (m) => m.default as SiteDeclaration,
      ),
    ),
)

export const allSites: SiteDefinition[] =
  funnelProvider.resolveSites(declarations)
