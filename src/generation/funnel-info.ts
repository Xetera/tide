import type { FunnelProvider } from '@tide/spec'
import type {
  PageFunnelEntry,
  NetworkFunnelEntry,
} from '@tide/spec'
import type { FunnelInfo } from '~/generation/types'

export function buildFunnelInfos(provider: FunnelProvider): FunnelInfo[] {
  const fixtures = provider.getFixtures()

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
    const entryFixtures = fixtures
      .filter((f) => f.site === entry.site && f.funnel === entry.funnel)
      .map((f) => ({ path: f.path, name: f.name, data: f.data }))
    return {
      site: entry.site,
      funnel: entry.funnel,
      file: entry.file,
      path: entry.path,
      expression: entry.expression,
      format,
      fixtures: entryFixtures,
      request,
    }
  }

  return [
    ...provider.getPageEntries().flatMap((e) => toInfo(e, 'htmlegy') ?? []),
    ...provider.getNetworkEntries().flatMap((e) => toInfo(e, 'jsonata') ?? []),
  ]
}
