import {
  type TArray,
  type TBoolean,
  type TInteger,
  type TObject,
  type TOptional,
  type TString,
  type TUnion,
  Type,
  TUnsafe,
  TRecord,
} from 'typebox'
import type { Entity, HtmlEvatePage, PageSpec, SiteDefinition } from '~/site-spec/types'
import { parse } from '~/htmlevate/parser'

// just a type to correlate unsafe references
type TReference = symbol

const TimestampPrecision = Type.Enum(['full', 'year', 'month', 'day'], {
  default: 'full',
})

const Timestamp = Type.Object({
  _type: Type.Literal('timestamp'),
  value: Type.String({ description: 'ISO 8601 string timestamp' }),
  precision: TimestampPrecision,
})

const EntityId = Type.Union([Type.Array(Type.String()), Type.String()])

type FieldInput = Record<
  string,
  | TUnion
  | TObject
  | TArray
  | TOptional
  | TString
  | TInteger
  | TBoolean
  | TUnsafe<TReference>
  | TRecord
>

export class EntityBuilder {
  readonly #entityName: string
  #version: number = 0
  #fields!: Entity['fields']
  #canonicalUrl?: string
  #uniqueFields?: string[]
  #displayField?: string

  constructor(entityName: string) {
    this.#entityName = entityName
  }

  version(v: number): this {
    this.#version = v
    return this
  }

  canonicalUrl(template: string): this {
    this.#canonicalUrl = template
    return this
  }

  unique(fields: string[]): this {
    this.#uniqueFields = fields
    return this
  }

  display(field: string): this {
    this.#displayField = field
    return this
  }

  fields(input: FieldInput): this {
    const fields: FieldInput = {}
    for (const [key, value] of Object.entries(input)) {
      fields[key] = Type.Optional(Type.Union([value, Type.Null()]))
    }

    this.#fields = Type.Object(
      {
        ...fields,
        _entity: Type.Literal(this.#entityName),
        _id: EntityId,
        _createdAt: Type.Optional(Timestamp),
      },
      { $defs: buildEntityRefs() },
    )
    return this
  }

  build(): Entity {
    if (!this.#fields) {
      throw new Error(`Entity "${this.#entityName}" has no fields defined`)
    }
    return {
      entity: this.#entityName,
      version: this.#version,
      fields: this.#fields,
      canonicalUrl: this.#canonicalUrl,
      uniqueFields: this.#uniqueFields,
      displayField: this.#displayField,
    }
  }
}

export function resolveCanonicalUrl(
  template: string,
  patch: import('./types').RawEntityPatch,
): string {
  return template.replace(/\{(\w+)\}/g, (_, key) => {
    const value =
      key === 'id' ? patch._id : (patch as Record<string, unknown>)[key]
    return value != null ? String(Array.isArray(value) ? value[0] : value) : ''
  })
}

export function entityKey(entityName: string): string {
  return entityName.replace(/^@/, '').replace('/', '__')
}

export function buildEntityRefs() {
  const defs: Record<string, unknown> = {
    EntityRef: {
      type: 'object',
      properties: {
        _id: {},
      },
      required: ['_id'],
    },
  }
  return defs
}

export function One(entityName: string) {
  return Type.Unsafe<TReference>({
    $ref: `#/$defs/EntityRef`,
    'x-cardinality': 'one',
    'x-entity': entityName,
  })
}

export function Many(entityName: string) {
  return Type.Unsafe<TReference>({
    $ref: `#/$defs/EntityRef`,
    'x-cardinality': 'many',
    'x-entity': entityName,
  })
}

type SiteInput = Omit<SiteDefinition, 'loaders' | 'pages' | 'htmlevatePages' | 'entities'> & {
  dir: string
  icon?: string
  entities: EntityBuilder[]
  loaderEntries: import('~/loaders').LoaderEntry[]
}

export function defineSite(input: SiteInput): SiteDefinition {
  const allPageModules = import.meta.glob('../sites/*/pages/*/index.ts', {
    import: 'default',
    eager: true,
  }) as Record<string, PageSpec>

  const allHtmlevateModules = import.meta.glob('../sites/*/pages/*/index.htmlevate', {
    query: '?raw',
    import: 'default',
    eager: true,
  }) as Record<string, string>

  const pages: PageSpec[] = []
  for (const [path, page] of Object.entries(allPageModules)) {
    const match = path.match(/\/sites\/([^/]+)\/pages\//)
    if (!match) {
      continue
    }
    const [, site] = match
    if (site !== input.dir) {
      continue
    }
    pages.push(page)
  }

  const htmlevatePages: HtmlEvatePage[] = []
  for (const [path, source] of Object.entries(allHtmlevateModules)) {
    const match = path.match(/\/sites\/([^/]+)\/pages\//)
    if (!match) {
      continue
    }
    const [, site] = match
    if (site !== input.dir) {
      continue
    }
    const { frontmatter } = parse(source)
    if (!frontmatter.entity || !frontmatter.urlPattern) {
      console.warn(`[htmlevate] ${path} missing entity or urlPattern frontmatter`)
      continue
    }
    htmlevatePages.push({
      $entity: String(frontmatter.entity),
      $urlPattern: frontmatter.urlPattern as string | string[],
      $hostname: input.hostname,
      source,
    })
  }

  const loaders: SiteDefinition['loaders'] = {}
  const requests: SiteDefinition['requests'] = { ...input.requests }
  for (const entry of input.loaderEntries) {
    if (entry.site !== input.dir) {
      continue
    }
    loaders[entry.loader] ??= []
    loaders[entry.loader]!.push({
      format: entry.format,
      file: entry.file,
      expression: entry.expression,
    })
    if (entry.format === 'htmlevate' && !(entry.loader in requests)) {
      const { frontmatter } = parse(entry.expression)
      const urlPattern = frontmatter.urlPattern
      if (urlPattern && typeof urlPattern === 'string') {
        requests[entry.loader] = { method: 'GET', url: urlPattern }
      }
    }
  }

  const site: SiteDefinition = {
    hostname: input.hostname,
    dir: input.dir,
    icon: input.icon,
    entities: input.entities.map((e) => e.build()),
    requests,
    loaders,
    pages,
    htmlevatePages,
  }
  return site
}

export function patchSiteSource(
  site: SiteDefinition,
  relPath: string,
  content: string,
): boolean {
  const pageMatch = relPath.match(/sites\/([^/]+)\/pages\/([^/]+)\/index\.htmlevate$/)
  if (pageMatch && pageMatch[1] === site.dir) {
    try {
      const { frontmatter } = parse(content)
      if (!frontmatter.entity || !frontmatter.urlPattern) {
        return false
      }
      const entity = String(frontmatter.entity)
      const idx = site.htmlevatePages.findIndex((p) => p.$entity === entity)
      const updated: import('~/site-spec/types').HtmlEvatePage = {
        $entity: entity,
        $urlPattern: frontmatter.urlPattern as string | string[],
        $hostname: site.hostname,
        source: content,
      }
      if (idx >= 0) {
        site.htmlevatePages[idx] = updated
      } else {
        site.htmlevatePages.push(updated)
      }
    } catch {
      return false
    }
    return true
  }

  const loaderMatch = relPath.match(/sites\/([^/]+)\/loaders\/(?:[^/]+\/)?(.+\.(jsonata|htmlevate))$/)
  if (loaderMatch && loaderMatch[1] === site.dir) {
    const file = loaderMatch[2]!
    for (const entries of Object.values(site.loaders)) {
      for (const entry of entries) {
        if (entry.file === file) {
          entry.expression = content
          return true
        }
      }
    }
  }
  return false
}
