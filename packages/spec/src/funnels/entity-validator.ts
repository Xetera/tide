import { Value } from 'typebox/value'
import type {
  Entity,
  EntityPatch,
  RawEntityPatch,
  SiteDeclaration,
} from './types'
import { identityRegistry, type IdentityFn } from './media-types'
import { resolveCanonicalUrl } from './site-builder'

function isIdentityTarget(
  value: unknown,
): value is Record<string, unknown> & { url: string } {
  return (
    typeof value === 'object' &&
    value !== null &&
    'url' in value &&
    typeof (value as { url: unknown }).url === 'string'
  )
}

function applyIdentity(
  value: unknown,
  identity: { fn: string },
  resolved: IdentityFn | undefined,
  patchIndex: number,
  warnings: IdentityWarning[],
): unknown {
  if (!isIdentityTarget(value)) {
    return value
  }
  if (value._id != null) {
    return value
  }
  if (!resolved) {
    warnings.push({
      message: `unknown identity function: ${identity.fn}`,
      patchIndex,
    })
    return value
  }
  try {
    return { ...value, _id: resolved({ url: value.url }) }
  } catch (error) {
    warnings.push({
      message: error instanceof Error ? error.message : 'unknown error',
      patchIndex,
    })
    return value
  }
}

type WalkableSchema = {
  type?: string
  anyOf?: WalkableSchema[]
  items?: WalkableSchema
  properties?: Record<string, WalkableSchema>
  'x-identity'?: { fn: string }
}

function walkSchema(
  value: unknown,
  schema: WalkableSchema,
  patchIndex: number,
  warnings: IdentityWarning[],
): unknown {
  const identity = schema['x-identity']
  if (identity) {
    return applyIdentity(
      value,
      identity,
      identityRegistry.get(identity.fn),
      patchIndex,
      warnings,
    )
  }

  if (
    schema.type === 'object' &&
    schema.properties &&
    typeof value === 'object' &&
    value !== null
  ) {
    const result: Record<string, unknown> = {
      ...(value as Record<string, unknown>),
    }
    for (const [key, childSchema] of Object.entries(schema.properties)) {
      const childValue = (value as Record<string, unknown>)[key]
      result[key] = walkSchema(childValue, childSchema, patchIndex, warnings)
    }
    return result
  }

  if (schema.type === 'array' && schema.items && Array.isArray(value)) {
    return value.map((item) =>
      walkSchema(item, schema.items!, patchIndex, warnings),
    )
  }

  if (schema.anyOf) {
    let result = value
    for (const variant of schema.anyOf) {
      result = walkSchema(result, variant, patchIndex, warnings)
    }
    return result
  }

  return value
}

export interface IdentityWarning {
  message: string
  patchIndex: number
}

export interface EntityValidationError {
  entity: string
  path: string
  message: string
  value: unknown
}

export class EntityValidator {
  #entities: Map<string, Entity>

  constructor(sites: SiteDeclaration[]) {
    this.#entities = new Map()
    for (const site of sites) {
      for (const entity of site.entities) {
        this.#entities.set(entity.entity, entity)
      }
    }
  }

  validate(name: string, data: unknown): EntityValidationError[] {
    const entity = this.#entities.get(name)
    if (!entity) {
      return [
        {
          entity: name,
          path: '',
          message: `Unknown entity "${name}"`,
          value: data,
        },
      ]
    }
    return [...Value.Errors(entity.fields, data)].map((err) => ({
      entity: name,
      path: err.instancePath ?? '',
      message: err.message,
      value: err.params,
    }))
  }

  parse(name: string, data: RawEntityPatch): EntityPatch {
    const entity = this.#entities.get(name)
    if (!entity) {
      throw new Error(`Unknown entity "${name}"`)
    }

    return Value.Parse(entity.fields, data) as EntityPatch
  }

  parsePatches(result: unknown): {
    patches: EntityPatch[]
    errors: EntityValidationError[]
  } {
    if (result === undefined) {
      throw new Error('parsePatches received undefined result')
    }
    const raw: unknown[] = Array.isArray(result) ? result : [result]
    const patches: EntityPatch[] = []
    const errors: EntityValidationError[] = []
    for (const item of raw) {
      if (!EntityValidator.isEntityPatch(item)) {
        continue
      }
      const entityName = item._entity
      try {
        patches.push(this.parse(entityName, item))
      } catch {
        const errs = this.validate(entityName, item)
        console.warn(
          '[tide] validation failed for',
          entityName,
          JSON.stringify(item),
          JSON.stringify(errs),
        )
        errors.push(...errs)
      }
    }
    const deduped = EntityValidator.deduplicateByIdentity(patches)
    const removed = patches.length - deduped.length
    if (removed > 0) {
      console.log(
        `[tide] removed ${removed} duplicate patch${removed === 1 ? '' : 'es'}`,
      )
    }
    return { patches: deduped, errors }
  }

  static deduplicateByIdentity(patches: EntityPatch[]): EntityPatch[] {
    const byPopularity = patches.toSorted(
      (a, b) => Object.keys(b).length - Object.keys(a).length,
    )
    const seen = new Map<string, EntityPatch>()
    for (const patch of byPopularity) {
      const key = EntityValidator.patchKey(patch)
      if (seen.has(key)) {
        continue
      }
      seen.set(key, patch)
    }
    return [...seen.values()]
  }

  static patchKey(patch: RawEntityPatch): string {
    const id = Array.isArray(patch._id) ? patch._id.join(',') : patch._id
    return `${patch._entity}:${id}`
  }

  applyIdentityExprs(patches: EntityPatch[]): {
    patches: EntityPatch[]
    warnings: IdentityWarning[]
  } {
    const warnings: IdentityWarning[] = []
    const result = patches.map((patch, patchIndex) => {
      const entity = this.#entities.get(patch._entity)
      if (!entity) {
        return patch
      }
      return walkSchema(
        patch,
        entity.fields as unknown as WalkableSchema,
        patchIndex,
        warnings,
      ) as EntityPatch
    })
    return { patches: result, warnings }
  }

  applyCanonicalUrls(patches: EntityPatch[]): EntityPatch[] {
    return patches.map((patch) => {
      if (patch._url != null) {
        return patch
      }
      const entity = this.#entities.get(patch._entity)
      if (!entity?.canonicalUrl) {
        return patch
      }
      const url = resolveCanonicalUrl(entity.canonicalUrl, patch)
      if (url == null) {
        return patch
      }
      return { ...patch, _url: url }
    })
  }

  static isEntityPatch(item: unknown): item is RawEntityPatch {
    return (
      item !== null &&
      typeof item === 'object' &&
      '_entity' in item &&
      typeof item._entity === 'string'
    )
  }
}
