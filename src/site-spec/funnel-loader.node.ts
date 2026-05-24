import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import fg from 'fast-glob'
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

const _base = resolve(dirname(fileURLToPath(import.meta.url)), '..')

function rawGlob(patterns: string[]): Record<string, string> {
  const result: Record<string, string> = {}
  for (const pattern of patterns) {
    for (const file of fg.sync(pattern, { cwd: _base, absolute: true })) {
      result['../' + file.slice(_base.length + 1)] = readFileSync(file, 'utf8')
    }
  }
  return result
}

function jsonGlob(patterns: string[]): Record<string, unknown> {
  const result: Record<string, unknown> = {}
  for (const pattern of patterns) {
    for (const file of fg.sync(pattern, { cwd: _base, absolute: true })) {
      result['../' + file.slice(_base.length + 1)] = JSON.parse(readFileSync(file, 'utf8'))
    }
  }
  return result
}

const rawJsonataModules = rawGlob([
  'sites/*/loaders/*/*.jsonata',
  'sites/*/loaders/*.jsonata',
])

const rawHtmlegyModules = rawGlob([
  'sites/*/loaders/*/*.htmlegy',
  'sites/*/loaders/*.htmlegy',
])

const rawFixtureModules = jsonGlob(['sites/*/loaders/*/*.json'])

const { page: pageEntries, network: networkEntries } = parseAllEntries(
  rawJsonataModules,
  rawHtmlegyModules,
)
export const funnelProvider = new FunnelProvider(
  pageEntries,
  networkEntries,
  parseFixtures(rawFixtureModules),
)
