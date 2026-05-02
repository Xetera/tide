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
  format: 'jsonata' | 'htmlevate'
}

export interface FixtureEntry {
  site: string
  loader: string
  path: string
  name: string
  data: unknown
}

const rawJsonataModules = {
  ...import.meta.glob('./sites/*/loaders/*/*.jsonata', {
    query: '?raw',
    import: 'default',
    eager: true,
  }),
  ...import.meta.glob('./sites/*/loaders/*.jsonata', {
    query: '?raw',
    import: 'default',
    eager: true,
  }),
} as Record<string, string>

const rawHtmlevateModules = {
  ...import.meta.glob('./sites/*/loaders/*/*.htmlevate', {
    query: '?raw',
    import: 'default',
    eager: true,
  }),
  ...import.meta.glob('./sites/*/loaders/*.htmlevate', {
    query: '?raw',
    import: 'default',
    eager: true,
  }),
} as Record<string, string>

const rawFixtureModules = import.meta.glob('./sites/*/loaders/*/*.json', {
  import: 'default',
  eager: true,
}) as Record<string, unknown>

const LOADER_DIR_RE = /\/sites\/([^/]+)\/loaders\/([^/]+)\/(.+\.(jsonata|htmlevate))$/
const LOADER_FLAT_RE = /\/sites\/([^/]+)\/loaders\/([^/]+\.(jsonata|htmlevate))$/
const FIXTURE_RE = /\/sites\/([^/]+)\/loaders\/([^/]+)\/([^/]+\.json)$/

function parseLoaderEntry(path: string, expression: string, format: 'jsonata' | 'htmlevate'): LoaderEntry[] {
  const dirMatch = path.match(LOADER_DIR_RE)
  if (dirMatch) {
    const [, site, loader, file] = dirMatch
    return [
      {
        site: site!,
        loader: loader!,
        file: file!,
        path: `src/sites${path.split('/sites')[1]}`,
        expression,
        format,
      },
    ]
  }
  const flatMatch = path.match(LOADER_FLAT_RE)
  if (flatMatch) {
    const [, site, filename] = flatMatch
    const loader = filename!.replace(/\.(jsonata|htmlevate)$/, '')
    return [
      {
        site: site!,
        loader: loader!,
        file: filename!,
        path: `src/sites${path.split('/sites')[1]}`,
        expression,
        format,
      },
    ]
  }
  return []
}

export const loaderEntries: LoaderEntry[] = [
  ...Object.entries(rawJsonataModules).flatMap(([path, expression]) =>
    parseLoaderEntry(path, expression, 'jsonata'),
  ),
  ...Object.entries(rawHtmlevateModules).flatMap(([path, expression]) =>
    parseLoaderEntry(path, expression, 'htmlevate'),
  ),
]

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
    if (site.matchesCapture(parsedUrl, method)) {
      return true
    }
  }
  return false
}

export function buildLoaderInfos(sites: SiteDefinition[]): LoaderInfo[] {
  return loaderEntries.map((entry) => {
    const fixtures = fixtureEntries
      .filter((f) => f.site === entry.site && f.loader === entry.loader)
      .map((f) => ({ path: f.path, name: f.name, data: f.data }))
    const site = sites.find((s) => s.hasLoader(entry.loader))
    const matcher = site?.getLoaderRequest(entry.loader)
    return {
      site: entry.site,
      loader: entry.loader,
      file: entry.file,
      path: entry.path,
      expression: entry.expression,
      format: entry.format,
      fixtures,
      request: matcher
        ? { method: matcher.method, url: matcher.url }
        : undefined,
    }
  })
}

export function buildSiteLoaders(dir: string): Record<string, import('~/site-spec/types').LoaderExpression[]> {
  const loaders: Record<string, import('~/site-spec/types').LoaderExpression[]> = {}
  for (const entry of loaderEntries) {
    if (entry.site !== dir) {
      continue
    }
    loaders[entry.loader] ??= []
    loaders[entry.loader]!.push({
      format: entry.format,
      file: entry.file,
      expression: entry.expression,
    })
  }
  return loaders
}

if (import.meta.hot) {
  import.meta.hot.on('spatula:source-update', ({ path, content }: { path: string; content: string }) => {
    const viteKey = `./${path}`
    const entry = loaderEntries.find((e) => e.path === `src/${path}`)
    if (!entry) {
      return
    }
    entry.expression = content
    if (path.endsWith('.jsonata')) {
      rawJsonataModules[viteKey] = content
    } else if (path.endsWith('.htmlevate')) {
      rawHtmlevateModules[viteKey] = content
    }
  })
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
