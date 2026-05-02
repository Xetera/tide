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
