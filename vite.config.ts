/// <reference types="vitest" />
import { defineConfig } from 'vite'
import solidPlugin from 'vite-plugin-solid'
import { crx } from '@crxjs/vite-plugin'
import manifest from './manifest'
import uno from 'unocss/vite'
import { isDev } from 'solid-js/web'
import { r } from './src/scripts'
// import devtools from 'solid-devtools/vite';

export default defineConfig({
  plugins: [
    /*
    Uncomment the following line to enable solid-devtools.
    For more info see https://github.com/thetarnav/solid-devtools/tree/main/packages/extension#readme
    */
    // devtools(),
    solidPlugin(),
    crx({ manifest }),
    uno(),
  ],
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
    port: 3000,
    hmr: {
      port: 3000,
    },
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
