import { writeFileSync, mkdirSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { ImageType, VideoType } from '~/extraction/media-types'
import { buildEntityRefs, entityKey } from '~/site-spec/site-builder'
import type { Entity } from '~/site-spec/types'
import { instagramEntities } from '~/sites/instagram/entities'
import { robloxEntities } from '~/sites/roblox/entities'
import { sahibindenEntities } from '~/sites/sahibinden/entities'
import { twitterEntities } from '~/sites/twitter/entities'

const __dirname = dirname(fileURLToPath(import.meta.url))
const outDir = resolve(__dirname, '../../schemas')

mkdirSync(outDir, { recursive: true })

const allEntities: Entity[] = [
  ...instagramEntities,
  ...robloxEntities,
  ...sahibindenEntities,
  ...twitterEntities,
].map((e) => e.build())

const defs: Record<string, unknown> = {
  ...buildEntityRefs(),
  ImageRef: ImageType,
  VideoRef: VideoType,
}

for (const entity of allEntities) {
  defs[entityKey(entity.entity)] = {
    ...entity.fields,
    $id: entity.entity,
    ...(entity.canonicalUrl ? { 'x-canonical-url': entity.canonicalUrl } : {}),
    ...(entity.uniqueFields ? { 'x-unique-fields': entity.uniqueFields } : {}),
    ...(entity.displayField ? { 'x-display-field': entity.displayField } : {}),
  }
}

const schema = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  $id: 'https://raw.githubusercontent.com/Xetera/spatula/main/schemas/entities.json',
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

process.stdout.write(`wrote schemas to ${outDir}\n`)
