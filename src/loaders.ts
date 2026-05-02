import type { LoaderInfo } from '~/generation/types'
import {
  SiteDefinition,
  PageLoader,
  NetworkLoader,
  RequestMatcher,
  LoaderExpression,
} from '~/site-spec/types'
import { matchesGlob } from '~/extraction/glob'
import { parse } from '~/htmlevate/parser'
export { matchesGlob }
export type { LoaderEntry, FixtureEntry } from '~/site-spec/loader-entry'
import type { LoaderEntry, FixtureEntry } from '~/site-spec/loader-entry'

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

const LOADER_DIR_RE =
  /\/sites\/([^/]+)\/loaders\/([^/]+)\/(.+\.(jsonata|htmlevate))$/
const LOADER_FLAT_RE =
  /\/sites\/([^/]+)\/loaders\/([^/]+\.(jsonata|htmlevate))$/
const FIXTURE_RE = /\/sites\/([^/]+)\/loaders\/([^/]+)\/([^/]+\.json)$/

function parseLoaderEntry(
  path: string,
  expression: string,
  format: 'jsonata' | 'htmlevate',
): LoaderEntry[] {
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

function parseAllEntries(): LoaderEntry[] {
  return [
    ...Object.entries(rawJsonataModules).flatMap(([path, expression]) =>
      parseLoaderEntry(path, expression, 'jsonata'),
    ),
    ...Object.entries(rawHtmlevateModules).flatMap(([path, expression]) =>
      parseLoaderEntry(path, expression, 'htmlevate'),
    ),
  ]
}

function parseFixtures(): FixtureEntry[] {
  return Object.entries(rawFixtureModules).flatMap(([path, data]) => {
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
}

export class LoaderProvider {
  #entries: LoaderEntry[]
  #fixtures: FixtureEntry[]

  constructor(entries: LoaderEntry[], fixtures: FixtureEntry[]) {
    this.#entries = entries
    this.#fixtures = fixtures
  }

  getEntries(): readonly LoaderEntry[] {
    return this.#entries
  }

  getFixtures(): readonly FixtureEntry[] {
    return this.#fixtures
  }

  getForSite(dir: string): readonly LoaderEntry[] {
    return this.#entries.filter((e) => e.site === dir)
  }

  getPageLoadersForSite(
    dir: string,
    hostname: string | undefined,
  ): PageLoader[] {
    const result: PageLoader[] = []
    for (const e of this.#entries) {
      if (e.site !== dir || e.format !== 'htmlevate') {
        continue
      }
      try {
        const { frontmatter } = parse(e.expression)
        const urlPattern = frontmatter.urlPattern
        if (!urlPattern) {
          continue
        }
        result.push(
          new PageLoader({
            name: e.loader,
            file: e.file,
            path: e.path,
            urlPattern,
            hostname,
            entry: e,
          }),
        )
      } catch {
        continue
      }
    }
    return result
  }

  buildNetworkLoaders(
    dir: string,
    hostname: string,
    requests: Record<string, RequestMatcher>,
  ): NetworkLoader[] {
    const grouped: Map<
      string,
      { matcher: RequestMatcher; entries: LoaderEntry[] }
    > = new Map()
    for (const entry of this.getForSite(dir)) {
      const matcher = requests[entry.loader]
      if (!matcher) {
        continue
      }
      const group = grouped.get(entry.loader) ?? { matcher, entries: [] }
      group.entries.push(entry)
      grouped.set(entry.loader, group)
    }
    const result: NetworkLoader[] = []
    for (const [name, { matcher, entries }] of grouped) {
      const first = entries[0]!
      const expressions: LoaderExpression[] = entries.map((e) => ({
        format: e.format,
        file: e.file,
        expression: e.expression,
      }))
      result.push(
        new NetworkLoader({
          name,
          file: first.file,
          path: `src/sites/${dir}/loaders/${first.file}`,
          format: first.format,
          hostname,
          urlPattern: matcher.url,
          url: matcher.url,
          method: matcher.method,
          expressions,
          source: first.expression,
        }),
      )
    }
    return result
  }

  patchEntry(path: string, content: string): boolean {
    const entry = this.#entries.find((e) => e.path === `src/${path}`)
    if (!entry) {
      return false
    }
    entry.expression = content
    return true
  }

  buildLoaderInfos(sites: SiteDefinition[]): LoaderInfo[] {
    return this.#entries.map((entry) => {
      const fixtures = this.#fixtures
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

  buildBuiltinExamples(
    maxCount = 3,
  ): { loaderName: string; expression: string; fixtureSnippet: string }[] {
    const examples: {
      loaderName: string
      expression: string
      fixtureSnippet: string
    }[] = []
    for (const entry of this.#entries) {
      const fixture = this.#fixtures.find(
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
}

export const loaderProvider = new LoaderProvider(
  parseAllEntries(),
  parseFixtures(),
)

if (import.meta.hot) {
  import.meta.hot.on(
    'spatula:source-update',
    ({ path, content }: { path: string; content: string }) => {
      loaderProvider.patchEntry(path, content)
    },
  )
}

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
