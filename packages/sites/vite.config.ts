import { resolve } from 'node:path'
import { defineConfig } from 'vitest/config'

const GLEAM_DIR = resolve(__dirname, '../../gleam')

export default defineConfig({
  resolve: {
    alias: [
      {
        find: '~gleam/',
        replacement: `${GLEAM_DIR}/build/dev/javascript/tide_shared/`,
      },
    ],
  },
  test: {
    environment: 'node',
    include: ['**/*.spec.ts'],
  },
})
