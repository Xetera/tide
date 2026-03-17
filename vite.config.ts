/// <reference types="vitest" />
import { defineConfig } from 'vite'
import solidPlugin from 'vite-plugin-solid'
import { crx } from '@crxjs/vite-plugin'
import manifest from './manifest'
import uno from 'unocss/vite'
import { r } from './src/scripts'
import devtools from 'solid-devtools/vite'

export default defineConfig({
  plugins: [crx({ manifest }), devtools(), solidPlugin(), uno()],
  // root: r("src"),
  resolve: {
    alias: [
      { find: '~/', replacement: `${r('src')}/` },
      // alias: [
      {
        find: 'msw/node',
        replacement: '/node_modules/msw/lib/native/index.mjs',
      },
      // ],
    ],
  },
  server: {
    cors: {
      origin: [/chrome-extension:\/\//],
    },
    port: 3000,
    // strictPort: true,
    // hmr: {
    //   port: 3000,
    // },
  },
  build: {
    outDir: r('extension/dist'),
    target: 'esnext',
    sourcemap: true,
  },
  test: {
    environmentOptions: {
      jsdom: {
        url: 'http://localhost',
      },
    },
    setupFiles: ['./src/setup-test.ts'],
    include: ['**/*.spec.ts'],
    // environment: 'jsdom',
    environment: 'happy-dom',
  },
})
