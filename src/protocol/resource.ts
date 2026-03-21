import type { PageSpec } from './scrapeer'

export const constructPathRegex = (pattern: string): RegExp => {
  const regexValue = normalizePath(pattern).replaceAll(
    /:([a-zA-Z0-9-_]+)/g,
    String.raw`(?<$1>[a-zA-Z0-9-_]+)`,
  )
  return new RegExp(`^${regexValue}$`, 'g')
}

export const constructPathRegexes = (pattern: string | string[]): RegExp[] =>
  (Array.isArray(pattern) ? pattern : [pattern]).map(constructPathRegex)

export const normalizePath = (path: string): string => path.replace(/\/$/, '')

export const originToUrl = (origin: string) =>
  `https://${origin.replace(/^\./, '')}`

export const toOrigin = (resource: PageSpec) => `*://${resource.$hostname}/*`

export const toOrigins = (resources: PageSpec[]) => resources.map(toOrigin)
