import type { LoaderInfo } from '~/generation/types'
import type { SiteDefinition } from '~/site-spec/types'
import { matchesGlob } from '~/extraction/glob'
export { matchesGlob }

export interface LoaderEntry {
  site: string
  loader: string
  file: string
  path: string
  expression: string
}

export interface FixtureEntry {
  site: string
  loader: string
  path: string
  name: string
  data: unknown
}

const rawLoaderModules = import.meta.glob('./sites/*/loaders/*/*.jsonata', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>

const rawFixtureModules = import.meta.glob('./sites/*/loaders/*/*.json', {
  import: 'default',
  eager: true,
}) as Record<string, unknown>

const LOADER_RE = /\/sites\/([^/]+)\/loaders\/([^/]+)\/(.+\.jsonata)$/
const FIXTURE_RE = /\/sites\/([^/]+)\/loaders\/([^/]+)\/([^/]+\.json)$/

export const loaderEntries: LoaderEntry[] = Object.entries(
  rawLoaderModules,
).flatMap(([path, expression]) => {
  const match = path.match(LOADER_RE)
  if (!match) {
    return []
  }
  const [, site, loader, file] = match
  return [
    {
      site: site!,
      loader: loader!,
      file: file!,
      path: `src/sites${path.split('/sites')[1]}`,
      expression,
    },
  ]
})

export const fixtureEntries: FixtureEntry[] = Object.entries(
  rawFixtureModules,
).flatMap(([path, data]) => {
  const match = path.match(FIXTURE_RE)
  if (!match) {
    return []
  }
  const [, site, loader, name] = match
  return [
    {
      site: site!,
      loader: loader!,
      path: `src/sites${path.split('/sites')[1]}`,
      name: name!,
      data,
    },
  ]
})

export function captureMatchesKnownLoader(
  sites: SiteDefinition[],
  url: string,
  method: string,
): boolean {
  let parsedUrl: URL
  try {
    parsedUrl = new URL(url)
  } catch {
    return false
  }
  for (const site of sites) {
    for (const matcher of Object.values(site.requests)) {
      if (matcher.method.toUpperCase() !== method.toUpperCase()) {
        continue
      }
      if (matchesGlob(matcher.url, parsedUrl.pathname)) {
        return true
      }
    }
  }
  return false
}

export function buildLoaderInfos(sites: SiteDefinition[]): LoaderInfo[] {
  return loaderEntries.map((entry) => {
    const fixtures = fixtureEntries
      .filter((f) => f.site === entry.site && f.loader === entry.loader)
      .map((f) => ({ path: f.path, name: f.name, data: f.data }))
    const site = sites.find((s) => s.loaders[entry.loader])
    const matcher = site?.requests[entry.loader]
    return {
      loader: entry.loader,
      file: entry.file,
      path: entry.path,
      expression: entry.expression,
      fixtures,
      request: matcher
        ? { method: matcher.method, url: matcher.url }
        : undefined,
    }
  })
}

export function buildSiteLoaders(dir: string): SiteDefinition['loaders'] {
  const loaders: SiteDefinition['loaders'] = {}
  for (const entry of loaderEntries) {
    if (entry.site !== dir) {
      continue
    }
    loaders[entry.loader] ??= []
    loaders[entry.loader]!.push({
      file: entry.file,
      expression: entry.expression,
    })
  }
  return loaders
}

export function buildBuiltinExamples(
  maxCount = 3,
): { loaderName: string; expression: string; fixtureSnippet: string }[] {
  const examples: {
    loaderName: string
    expression: string
    fixtureSnippet: string
  }[] = []
  for (const entry of loaderEntries) {
    const fixture = fixtureEntries.find(
      (f) => f.site === entry.site && f.loader === entry.loader,
    )
    const fixtureSnippet = fixture
      ? JSON.stringify(fixture.data, null, 2).slice(0, 3_000)
      : ''
    examples.push({
      loaderName: entry.loader,
      expression: entry.expression,
      fixtureSnippet,
    })
    if (examples.length >= maxCount) {
      break
    }
  }
  return examples
}
