import { createJiti } from 'jiti'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..')

const jiti = createJiti(import.meta.url, {
  alias: {
    '~': resolve(root, 'src'),
    '~gleam': resolve(root, 'gleam', 'build', 'dev', 'javascript', 'tide_shared') },
})

await jiti.import('./print-schema.ts')
