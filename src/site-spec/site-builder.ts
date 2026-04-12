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
} from 'typebox'
import type { Entity, PageSpec, SiteDefinition } from '~/site-spec/types'
import { buildSiteLoaders } from '~/loaders'

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
>

export class EntityBuilder {
  readonly #entityName: string
  #fields!: Entity['fields']
  #canonicalUrl?: string
  #uniqueFields?: string[]

  constructor(entityName: string) {
    this.#entityName = entityName
  }

  canonicalUrl(template: string): this {
    this.#canonicalUrl = template
    return this
  }

  unique(fields: string[]): this {
    this.#uniqueFields = fields
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
    if (!this.#fields)
      throw new Error(`Entity "${this.#entityName}" has no fields defined`)
    return { entity: this.#entityName, fields: this.#fields, canonicalUrl: this.#canonicalUrl, uniqueFields: this.#uniqueFields }
  }
}

export function resolveCanonicalUrl(template: string, patch: import('./types').RawEntityPatch): string {
  return template.replace(/\{(\w+)\}/g, (_, key) => {
    const value = key === 'id' ? patch._id : (patch as Record<string, unknown>)[key]
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

type SiteInput = Omit<SiteDefinition, 'loaders' | 'pages' | 'entities'> & {
  dir: string
  entities: EntityBuilder[]
}

export function defineSite(input: SiteInput): SiteDefinition {
  const allPageModules = import.meta.glob('../sites/*/pages/*/index.ts', {
    import: 'default',
    eager: true,
  }) as Record<string, PageSpec>

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

  return {
    hostname: input.hostname,
    entities: input.entities.map((e) => e.build()),
    requests: input.requests,
    loaders: buildSiteLoaders(input.dir),
    pages,
  }
}
