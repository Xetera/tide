export const normalizePath = (path: string): string => path.replace(/\/$/, '')

export const originToUrl = (origin: string) =>
  `https://${origin.replace(/^\./, '')}`

export const toOrigin = (site: { hostname: string }): string =>
  `https://${site.hostname}/*`
