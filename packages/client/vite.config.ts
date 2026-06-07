import { defineConfig } from 'vitest/config'

export default defineConfig({
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
