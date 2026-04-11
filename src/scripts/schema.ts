import { createJiti } from 'jiti'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..')

const jiti = createJiti(import.meta.url, {
  alias: { '~': resolve(root, 'src') },
})

await jiti.import('./print-schema.ts')
