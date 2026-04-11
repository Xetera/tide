import { Value } from 'typebox/value'
import type {
  Entity,
  EntityPatch,
  RawEntityPatch,
  SiteDefinition,
} from '~/site-spec/types'

export interface EntityValidationError {
  entity: string
  path: string
  message: string
  value: unknown
}

export class EntityValidator {
  #entities: Map<string, Entity>

  constructor(sites: SiteDefinition[]) {
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
    if (!entity) throw new Error(`Unknown entity "${name}"`)
    return Value.Parse(entity.fields, data) as EntityPatch
  }

  parsePatches(
    result: unknown,
    context?: { loader: string; file: string; url: string },
  ): { patches: EntityPatch[]; errors: EntityValidationError[] } {
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
        errors.push(...this.validate(entityName, item))
      }
    }
    const deduped = EntityValidator.deduplicateByIdentity(patches)
    const removed = patches.length - deduped.length
    if (removed > 0) {
      console.log(
        `[spatula] removed ${removed} duplicate patch${removed === 1 ? '' : 'es'}`,
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

  static isEntityPatch(item: unknown): item is RawEntityPatch {
    return (
      item !== null &&
      typeof item === 'object' &&
      '_entity' in item &&
      typeof item._entity === 'string'
    )
  }
}
