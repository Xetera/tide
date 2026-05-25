import type { FunnelInfo } from '~/generation/types'
import {
  SiteDefinition,
  PageFunnel,
  NetworkFunnel,
  NetworkFunnelGroup,
  RequestMatcher,
} from '~/site-spec/types'
import { matchesGlob } from '~/extraction/glob'
import { parseFrontmatter } from '@tide/frontmatter'
export { matchesGlob }
import type {
  PageFunnelEntry,
  NetworkFunnelEntry,
  FixtureEntry,
} from '~/site-spec/types'
export type { PageFunnelEntry, NetworkFunnelEntry, FixtureEntry }

export const LOADER_FLAT_RE =
  /\/sites\/([^/]+)\/funnels\/([^/]+\.(jsonata|htmlegy))$/
export const FIXTURE_RE =
  /\/sites\/([^/]+)\/funnels\/([^/]+\.json)$/

export function parseEntry(
  path: string,
  expression: string,
): { site: string; funnel: string; file: string; path: string; expression: string; body: string; frontmatter: Record<string, unknown> } | null {
  const { body, frontmatter } = parseFrontmatter(expression)
  const flatMatch = path.match(LOADER_FLAT_RE)
  if (flatMatch) {
    const [, site, filename] = flatMatch
    const funnel = filename!.replace(/\.(jsonata|htmlegy)$/, '')
    return {
      site: site!,
      funnel: funnel!,
      file: filename!,
      path: `src/sites${path.split('/sites')[1]}`,
      expression,
      body,
      frontmatter,
    }
  }
  return null
}

export function parseAllEntries(
  rawJsonataModules: Record<string, string>,
  rawHtmlegyModules: Record<string, string>,
): { page: PageFunnelEntry[]; network: NetworkFunnelEntry[] } {
  const page = Object.entries(rawHtmlegyModules).flatMap(
    ([path, expression]) => {
      const entry = parseEntry(path, expression) as PageFunnelEntry | null
      return entry ? [entry] : []
    },
  )
  const network = Object.entries(rawJsonataModules).flatMap(
    ([path, expression]) => {
      const entry = parseEntry(path, expression) as NetworkFunnelEntry | null
      if (!entry) {
        return []
      }
      const url = entry.frontmatter.url
      if (
        typeof url !== 'string' &&
        !(Array.isArray(url) && url.every((u) => typeof u === 'string'))
      ) {
        console.warn(`[tide] ${path}: missing required frontmatter field "url"`)
        return []
      }
      return [entry]
    },
  )
  return { page, network }
}

export function parseFixtures(
  rawFixtureModules: Record<string, unknown>,
): FixtureEntry[] {
  return Object.entries(rawFixtureModules).flatMap(([path, data]) => {
    const match = path.match(FIXTURE_RE)
    if (!match) {
      return []
    }
    const [, site, filename] = match
    const funnel = filename!.replace(/\.json$/, '')
    return [
      {
        site: site!,
        funnel: funnel!,
        path: `src/sites${path.split('/sites')[1]}`,
        name: filename!,
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
        const url = e.frontmatter.url
        if (!url || (typeof url !== 'string' && !Array.isArray(url))) {
          continue
        }
        result.push(
          new PageFunnel({
            name: e.funnel,
            site: dir,
            file: e.file,
            path: e.path,
            url: url as string | string[],
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

  buildNetworkFunnels(dir: string, hostname: string): NetworkFunnelGroup[] {
    const grouped: Map<
      string,
      { matcher: RequestMatcher; entries: NetworkFunnelEntry[] }
    > = new Map()
    for (const entry of this.getForSite(dir)) {
      const { frontmatter } = entry
      const url = frontmatter.url as string | string[]
      const method =
        typeof frontmatter.method === 'string' ? frontmatter.method : 'GET'
      const matcher: RequestMatcher = {
        method: method as RequestMatcher['method'],
        url,
      }
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
      const { body, frontmatter } = parseFrontmatter(content)
      page.expression = content
      page.body = body
      page.frontmatter = frontmatter
      return true
    }
    const network = this.#networkEntries.find((e) => e.path === `src/${path}`)
    if (network) {
      const { body, frontmatter } = parseFrontmatter(content)
      network.expression = content
      network.body = body
      network.frontmatter = frontmatter
      return true
    }
    return false
  }

  buildFunnelInfos(_sites: SiteDefinition[]): FunnelInfo[] {
    const toInfo = (
      entry: PageFunnelEntry | NetworkFunnelEntry,
      format: 'htmlegy' | 'jsonata',
    ): FunnelInfo | null => {
      const { frontmatter } = entry
      let request: FunnelInfo['request']
      if (format === 'jsonata') {
        const url = frontmatter.url as string | string[]
        const method =
          typeof frontmatter.method === 'string' ? frontmatter.method : 'GET'
        request = { method, url }
      } else {
        const urlPattern = frontmatter.url
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
      ...this.#pageEntries.flatMap((e) => toInfo(e, 'htmlegy') ?? []),
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
