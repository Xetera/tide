import { PageEvaluator } from './page-evaluator'
import { constructPathRegexes } from '~/site-spec/resource'
import type { PageSpec, UnknownPayload } from '~/site-spec/types'

export function findResource(id: string, resources: PageSpec[]): PageSpec {
  const resource = resources.find((r) => r.$entity === id)
  if (!resource) {
    throw new Error(`Resource ${id} not found`)
  }

  return resource
}

export function parseVariables(resource: PageSpec, url: URL) {
  const regexes = constructPathRegexes(resource.$urlPattern)
  const normalizedPath = PageEvaluator.normalizePath(url.pathname)
  const matching = regexes.flatMap((regex) =>
    Array.from(normalizedPath.matchAll(regex)),
  )

  if (matching.length === 0) {
    return
  }

  const variables = resource.$variables ?? {}

  const urlVariables = {} as UnknownPayload
  const definedUrlVariables = Object.entries(variables).filter(
    ([, v]) => v.$kind === 'url',
  )
  for (const { groups } of matching) {
    if (!groups) {
      continue
    }
    for (const [identifier, variable] of definedUrlVariables) {
      if (identifier in groups) {
        urlVariables[variable.$alias ?? identifier] = groups[identifier]
      }
    }
  }

  const definedQueryVariables = Object.entries(variables).filter(
    ([, v]) => v.$kind === 'query',
  )
  const queryVariables = Object.fromEntries(
    definedQueryVariables.map(([identifier, v]) => {
      const fromUrl = url.searchParams.get(identifier)
      const fallback =
        v.$ifMissing?.$strategy === 'fallback'
          ? v.$ifMissing.$value.$literal
          : undefined
      return [v.$alias ?? identifier, fromUrl ?? fallback]
    }),
  )

  return { ...queryVariables, ...urlVariables }
}
