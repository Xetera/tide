import { Type } from 'typebox'
import type { Entity, PageSpec, SiteDefinition } from '~/site-spec/types'

const TimestampRef = Type.Object({
  _type: Type.Literal('timestamp'),
  value: Type.String(),
  precision: Type.String(),
})

type EntityInput = Omit<Entity, '$fields' | '$entity'> & {
  $fields: ReturnType<typeof Type.Object>
}

export function defineEntity(entityName: string, input: EntityInput): Entity {
  return {
    ...input,
    $entity: entityName,
    $fields: Type.Object({
      _entity: Type.String(),
      _id: Type.Unknown(),
      _createdAt: Type.Optional(TimestampRef),
      ...Object.fromEntries(
        Object.entries(input.$fields.properties).map(([k, v]) => [k, Type.Optional(Type.Union([v as any, Type.Null()]))])
      ),
    }),
  }
}

type SiteInput = Omit<SiteDefinition, 'loaders' | 'pages'> & {
  dir: string
}

const allLoaderModules = import.meta.glob('../sites/*/loaders/*/*.jsonata', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>

const allPageModules = import.meta.glob('../sites/*/pages/*/index.ts', {
  import: 'default',
  eager: true,
}) as Record<string, PageSpec>

export function defineSite(input: SiteInput): SiteDefinition {
  const loaders: SiteDefinition['loaders'] = {}
  for (const [path, expression] of Object.entries(allLoaderModules)) {
    const match = path.match(/\/sites\/([^/]+)\/loaders\/([^/]+)\/.*\.jsonata$/)
    if (!match) {
      continue
    }
    const [, site, name] = match
    if (site !== input.dir || !name) {
      continue
    }
    const file = path.split('/').pop()!
    loaders[name] ??= []
    loaders[name].push({ file, expression })
  }

  const pages: PageSpec[] = []
  for (const [path, page] of Object.entries(allPageModules)) {
    const match = path.match(/\/sites\/([^/]+)\/pages\//)
    if (!match) {
      continue
    }
    const [, site] = match
    if (site !== input.dir) continue
    pages.push(page)
  }

  return {
    hostname: input.hostname,
    entities: input.entities,
    requests: input.requests,
    loaders,
    pages,
  }
}
