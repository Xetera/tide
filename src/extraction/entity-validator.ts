import { Type } from 'typebox'
import { Value } from 'typebox/value'
import type { Entity, EntityPatch, SiteDefinition } from '~/site-spec/types'

const RefSchema = Type.Object({
  _ref: Type.String(),
  id: Type.Union([Type.String(), Type.Array(Type.String())]),
})

const RefArraySchema = Type.Array(RefSchema)

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
        this.#entities.set(entity.$entity, entity)
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
    return [...Value.Errors(entity.$fields, data)].map((err) => ({
      entity: name,
      path: err.instancePath ?? '',
      message: err.message,
      value: err.params,
    }))
  }

  parse(name: string, data: unknown): unknown {
    const entity = this.#entities.get(name)
    if (!entity) throw new Error(`Unknown entity "${name}"`)
    const parsed = Value.Parse(entity.$fields, data) as Record<string, unknown>
    if (entity.$relationships) {
      for (const [field, rel] of Object.entries(entity.$relationships)) {
        if (!(field in parsed) || parsed[field] == null) {
          continue
        }
        const schema = rel.$cardinality === 'many' ? RefArraySchema : RefSchema
        const errors = [...Value.Errors(schema, parsed[field])]
        if (errors.length > 0) {
          throw new Error(
            `Relationship "${field}" on entity "${name}" failed validation: ${errors.map((e) => `${e.instancePath} ${e.message}`).join(', ')}`,
          )
        }
      }
    }
    return parsed
  }

  parsePatches(result: unknown, context?: { loader: string; file: string; url: string }): EntityPatch[] {
    const raw =
      result === undefined ? [] : Array.isArray(result) ? result : [result]
    return raw.flatMap((item) => {
      if (item === null || typeof item !== 'object' || !('_entity' in item)) {
        return []
      }
      const entityName = (item as Record<string, unknown>)._entity as string
      try {
        return [this.parse(entityName, item) as EntityPatch]
      } catch (err) {
        const errors = this.validate(entityName, item)
        console.warn(
          `[spatula] entity "${entityName}" failed schema validation, dropping`,
          ...(context ? [`loader: ${context.loader}/${context.file}`, `url: ${context.url}`] : []),
          errors,
          err instanceof Error ? err.message : err,
          item,
        )
        return []
      }
    })
  }
}
