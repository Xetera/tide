import type { FunnelInfo } from '~/generation/types'
import {
  SiteDefinition,
  PageFunnel,
  NetworkFunnel,
  NetworkFunnelGroup,
  RequestMatcher,
} from '~/site-spec/types'
import { matchesGlob } from '~/extraction/glob'
import { parse, parseFrontmatter } from '~/htmlevate/parser'
export { matchesGlob }
import type {
  PageFunnelEntry,
  NetworkFunnelEntry,
  FixtureEntry,
} from '~/site-spec/types'
export type { PageFunnelEntry, NetworkFunnelEntry, FixtureEntry }

const rawJsonataModules = {
  ...import.meta.glob('../sites/*/loaders/*/*.jsonata', {
    query: '?raw',
    import: 'default',
    eager: true,
  }),
  ...import.meta.glob('../sites/*/loaders/*.jsonata', {
    query: '?raw',
    import: 'default',
    eager: true,
  }),
} as Record<string, string>

const rawHtmlevateModules = {
  ...import.meta.glob('../sites/*/loaders/*/*.htmlevate', {
    query: '?raw',
    import: 'default',
    eager: true,
  }),
  ...import.meta.glob('../sites/*/loaders/*.htmlevate', {
    query: '?raw',
    import: 'default',
    eager: true,
  }),
} as Record<string, string>

const rawFixtureModules = import.meta.glob('../sites/*/loaders/*/*.json', {
  import: 'default',
  eager: true,
}) as Record<string, unknown>

const LOADER_DIR_RE =
  /\/sites\/([^/]+)\/loaders\/([^/]+)\/(.+\.(jsonata|htmlevate))$/
const LOADER_FLAT_RE =
  /\/sites\/([^/]+)\/loaders\/([^/]+\.(jsonata|htmlevate))$/
const FIXTURE_RE = /\/sites\/([^/]+)\/loaders\/([^/]+)\/([^/]+\.json)$/

function parseEntry<
  T extends {
    site: string
    funnel: string
    file: string
    path: string
    expression: string
  },
>(path: string, expression: string): T | null {
  const dirMatch = path.match(LOADER_DIR_RE)
  if (dirMatch) {
    const [, site, funnel, file] = dirMatch
    return {
      site: site!,
      funnel: funnel!,
      file: file!,
      path: `src/sites${path.split('/sites')[1]}`,
      expression,
    } as T
  }
  const flatMatch = path.match(LOADER_FLAT_RE)
  if (flatMatch) {
    const [, site, filename] = flatMatch
    const funnel = filename!.replace(/\.(jsonata|htmlevate)$/, '')
    return {
      site: site!,
      funnel: funnel!,
      file: filename!,
      path: `src/sites${path.split('/sites')[1]}`,
      expression,
    } as T
  }
  return null
}

function parseAllEntries(): {
  page: PageFunnelEntry[]
  network: NetworkFunnelEntry[]
} {
  const page = Object.entries(rawHtmlevateModules).flatMap(
    ([path, expression]) => {
      const entry = parseEntry<PageFunnelEntry>(path, expression)
      return entry ? [entry] : []
    },
  )
  const network = Object.entries(rawJsonataModules).flatMap(
    ([path, expression]) => {
      const entry = parseEntry<NetworkFunnelEntry>(path, expression)
      if (!entry) {
        return []
      }
      const { frontmatter } = parseFrontmatter(expression)
      const url = frontmatter.url
      if (typeof url !== 'string' && !(Array.isArray(url) && url.every((u) => typeof u === 'string'))) {
        console.warn(`[tide] ${path}: missing required frontmatter field "url"`)
        return []
      }
      return [entry]
    },
  )
  return { page, network }
}

function parseFixtures(): FixtureEntry[] {
  return Object.entries(rawFixtureModules).flatMap(([path, data]) => {
    const match = path.match(FIXTURE_RE)
    if (!match) {
      return []
    }
    const [, site, funnel, name] = match
    return [
      {
        site: site!,
        funnel: funnel!,
        path: `src/sites${path.split('/sites')[1]}`,
        name: name!,
        data,
      },
    ]
  })
}

export class FunnelProvider {
  #pageEntries: PageFunnelEntry[]
  #networkEntries: NetworkFunnelEntry[]
  #fixtures: FixtureEntry[]

  constructor(
    pageEntries: PageFunnelEntry[],
    networkEntries: NetworkFunnelEntry[],
    fixtures: FixtureEntry[],
  ) {
    this.#pageEntries = pageEntries
    this.#networkEntries = networkEntries
    this.#fixtures = fixtures
  }

  getEntries(): readonly (PageFunnelEntry | NetworkFunnelEntry)[] {
    return [...this.#pageEntries, ...this.#networkEntries]
  }

  getFixtures(): readonly FixtureEntry[] {
    return this.#fixtures
  }

  getForSite(dir: string): readonly NetworkFunnelEntry[] {
    return this.#networkEntries.filter((e) => e.site === dir)
  }

  getPageFunnelsForSite(
    dir: string,
    hostname: string | undefined,
  ): PageFunnel[] {
    const result: PageFunnel[] = []
    for (const e of this.#pageEntries) {
      if (e.site !== dir) {
        continue
      }
      try {
        const { frontmatter } = parse(e.expression)
        const urlPattern = frontmatter.urlPattern
        if (!urlPattern) {
          continue
        }
        result.push(
          new PageFunnel({
            name: e.funnel,
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

  buildNetworkFunnels(
    dir: string,
    hostname: string,
  ): NetworkFunnelGroup[] {
    const grouped: Map<
      string,
      { matcher: RequestMatcher; entries: NetworkFunnelEntry[] }
    > = new Map()
    for (const entry of this.getForSite(dir)) {
      const { frontmatter } = parseFrontmatter(entry.expression)
      const url = frontmatter.url as string | string[]
      const method = typeof frontmatter.method === 'string' ? frontmatter.method : 'GET'
      const matcher: RequestMatcher = { method: method as RequestMatcher['method'], url }
      const group = grouped.get(entry.funnel) ?? { matcher, entries: [] }
      group.entries.push(entry)
      grouped.set(entry.funnel, group)
    }
    const result: NetworkFunnelGroup[] = []
    for (const [name, { matcher, entries }] of grouped) {
      const funnels = entries.map(
        (e) =>
          new NetworkFunnel({
            name,
            file: e.file,
            path: e.path,
            request: matcher,
            entry: e,
          }),
      )
      result.push(
        new NetworkFunnelGroup({
          name,
          hostname,
          request: matcher,
          funnels,
        }),
      )
    }
    return result
  }

  patchEntry(path: string, content: string): boolean {
    const page = this.#pageEntries.find((e) => e.path === `src/${path}`)
    if (page) {
      page.expression = content
      return true
    }
    const network = this.#networkEntries.find((e) => e.path === `src/${path}`)
    if (network) {
      network.expression = content
      return true
    }
    return false
  }

  buildFunnelInfos(_sites: SiteDefinition[]): FunnelInfo[] {
    const toInfo = (
      entry: PageFunnelEntry | NetworkFunnelEntry,
      format: 'htmlevate' | 'jsonata',
    ): FunnelInfo | null => {
      const { frontmatter } = parseFrontmatter(entry.expression)
      let request: FunnelInfo['request']
      if (format === 'jsonata') {
        const url = frontmatter.url as string | string[]
        const method = typeof frontmatter.method === 'string' ? frontmatter.method : 'GET'
        request = { method, url }
      } else {
        const urlPattern = frontmatter.urlPattern
        if (!urlPattern) {
          return null
        }
        const url = Array.isArray(urlPattern) ? urlPattern[0] : urlPattern
        request = { method: 'GET', url: String(url) }
      }
      const fixtures = this.#fixtures
        .filter((f) => f.site === entry.site && f.funnel === entry.funnel)
        .map((f) => ({ path: f.path, name: f.name, data: f.data }))
      return {
        site: entry.site,
        funnel: entry.funnel,
        file: entry.file,
        path: entry.path,
        expression: entry.expression,
        format,
        fixtures,
        request,
      }
    }
    return [
      ...this.#pageEntries.flatMap((e) => toInfo(e, 'htmlevate') ?? []),
      ...this.#networkEntries.flatMap((e) => toInfo(e, 'jsonata') ?? []),
    ]
  }

  buildBuiltinExamples(
    maxCount = 3,
  ): { funnelName: string; expression: string; fixtureSnippet: string }[] {
    const examples: {
      funnelName: string
      expression: string
      fixtureSnippet: string
    }[] = []
    for (const entry of this.getEntries()) {
      const fixture = this.#fixtures.find(
        (f) => f.site === entry.site && f.funnel === entry.funnel,
      )
      const fixtureSnippet = fixture
        ? JSON.stringify(fixture.data, null, 2).slice(0, 3_000)
        : ''
      examples.push({
        funnelName: entry.funnel,
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

const { page: pageEntries, network: networkEntries } = parseAllEntries()
export const funnelProvider = new FunnelProvider(
  pageEntries,
  networkEntries,
  parseFixtures(),
)

if (import.meta.hot) {
  import.meta.hot.on(
    'tide:source-update',
    ({ path, content }: { path: string; content: string }) => {
      funnelProvider.patchEntry(path, content)
    },
  )
}

export function captureMatchesKnownFunnel(
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
