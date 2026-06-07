import { defineConfig } from 'vitest/config'
import { resolve } from 'node:path'

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
    include: ['**/*.spec.ts'],
    environment: 'happy-dom',
    setupFiles: ['./src/setup-test.ts'],
    environmentOptions: {
      jsdom: {
        url: 'http://localhost',
      },
    },
  },
})
