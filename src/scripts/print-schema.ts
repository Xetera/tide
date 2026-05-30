import { writeFileSync, mkdirSync, readdirSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { ImageType, VideoType, MoneyType } from '~/funnels/media-types'
import { buildEntityRefs, entityKey } from '~/funnels/site-builder'
import type { SiteDefinition, Entity } from '~/funnels/types'

const __dirname = dirname(fileURLToPath(import.meta.url))
const sitesDir = resolve(__dirname, '../sites')
const outDir = resolve(__dirname, '../../schemas')

mkdirSync(outDir, { recursive: true })

const siteDirs = readdirSync(sitesDir, { withFileTypes: true })
  .filter((d) => d.isDirectory())
  .map((d) => d.name)

const siteModules: SiteDefinition[] = await Promise.all(
  siteDirs.map(async (site) => {
    const mod = await import(`~/sites/${site}/index`) as { default: SiteDefinition }
    return mod.default
  }),
)

function collectEntityRefs(
  schema: unknown,
  found: Set<string> = new Set(),
): Set<string> {
  if (!schema || typeof schema !== 'object') {return found}
  if (Array.isArray(schema)) {
    for (const item of schema) {collectEntityRefs(item, found)}
    return found
  }
  const obj = schema as Record<string, unknown>
  if (typeof obj['x-entity'] === 'string') {found.add(obj['x-entity'])}
  for (const value of Object.values(obj)) {collectEntityRefs(value, found)}
  return found
}

const allEntities: Entity[] = siteModules.flatMap((site) => site.entities)

const knownNames = new Set(allEntities.map((e) => e.entity))

for (const entity of allEntities) {
  const refs = collectEntityRefs(entity.fields)
  for (const ref of refs) {
    if (!knownNames.has(ref)) {
      process.stderr.write(
        `error: entity "${entity.entity}" references unknown entity "${ref}"\n`,
      )
      process.exit(1)
    }
  }
}

const defs: Record<string, unknown> = {
  ...buildEntityRefs(),
  ImageRef: ImageType,
  VideoRef: VideoType,
  Money: MoneyType,
}

for (const entity of allEntities) {
  defs[entityKey(entity.entity)] = {
    ...entity.fields,
    'x-version': entity.version,
    ...(entity.canonicalUrl ? { 'x-canonical-url': entity.canonicalUrl } : {}),
    ...(entity.uniqueFields ? { 'x-unique-fields': entity.uniqueFields } : {}),
    ...(entity.displayField ? { 'x-display-field': entity.displayField } : {}),
  }
}

const schema = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  $id: 'https://raw.githubusercontent.com/Xetera/tide/main/schemas/entities.json',
  type: 'array',
  items: {
    oneOf: allEntities.map((entity) => ({
      $ref: `#/$defs/${entityKey(entity.entity)}`,
    })),
  },
  $defs: defs,
}

writeFileSync(
  resolve(outDir, 'entities.json'),
  JSON.stringify(schema, null, 2) + '\n',
)

const sites = siteModules.map((site) => ({
  hostname: site.hostname,
  id: site.id,
  ...(site.icon ? { icon: site.icon } : {}),
  entities: site.entities.map((e) => e.entity),
}))

writeFileSync(
  resolve(outDir, 'sites.json'),
  JSON.stringify(sites, null, 2) + '\n',
)

process.stdout.write(`wrote schemas to ${outDir}\n`)
