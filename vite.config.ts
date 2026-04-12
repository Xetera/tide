/// <reference types="vitest" />
import { defineConfig } from 'vite'
import solidPlugin from 'vite-plugin-solid'
import { crx } from '@crxjs/vite-plugin'
import manifest from './manifest'
import uno from 'unocss/vite'
import { r } from './src/scripts'
import devtools from 'solid-devtools/vite'
import { writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'

export default defineConfig({
  plugins: [
    {
      name: 'spatula-write',
      configureServer(server) {
        server.middlewares.use('/__spatula_write', async (req, res) => {
          if (req.method !== 'POST') {
            res.writeHead(405).end()
            return
          }
          const chunks: Buffer[] = []
          for await (const chunk of req) chunks.push(chunk)
          const { path: filePath, content } = JSON.parse(Buffer.concat(chunks).toString()) as { path: string; content: string }
          const abs = resolve(process.cwd(), filePath)
          if (!abs.startsWith(resolve(process.cwd(), 'src'))) {
            res.writeHead(403).end(JSON.stringify({ error: 'path outside src' }))
            return
          }
          await writeFile(abs, content, 'utf-8')
          res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({ ok: true }))
        })
      },
    },
    {
      name: 'jsonata-hmr',
      configureServer(server) {
        server.watcher.add('src/**/*.jsonata')
      },
      async handleHotUpdate({ file, server }) {
        if (!file.endsWith('.jsonata')) return
        const mods = server.moduleGraph.getModulesByFile(file)
        if (!mods) return
        const affected = new Set<(typeof mods extends Set<infer T> ? T : never)>()
        const collect = (mod: typeof mods extends Set<infer T> ? T : never) => {
          if (affected.has(mod)) return
          affected.add(mod)
          for (const importer of mod.importers) collect(importer)
        }
        for (const mod of mods) {
          await server.moduleGraph.invalidateModule(mod)
          collect(mod)
        }
        return [...affected]
      },
    },
    crx({ manifest, browser: (process.env.BROWSER as 'chrome' | 'firefox') ?? 'chrome' }),
    devtools(),
    solidPlugin(),
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
