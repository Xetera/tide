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
  TNumber,
} from 'typebox'
import { SiteDefinition } from '~/site-spec/types'
import type { Entity } from '~/site-spec/types'
import { MediaBuilder } from '~/extraction/media-types'
import type { FunnelProvider } from '~/site-spec/funnel-loader'

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
  | TNumber
  | TInteger
  | TBoolean
  | TUnsafe<TReference>
  | MediaBuilder
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

type SiteInput = {
  hostname: string
  id: string
  icon?: string
  entities: EntityBuilder[]
  funnelProvider: FunnelProvider
}

export function defineSite(input: SiteInput): SiteDefinition {
  return new SiteDefinition({
    hostname: input.hostname,
    id: input.id,
    icon: input.icon,
    entities: input.entities.map((e) => e.build()),
    provider: input.funnelProvider,
  })
}
