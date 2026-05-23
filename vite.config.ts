import { defineConfig } from 'vitest/config'
import solidPlugin from 'vite-plugin-solid'
import { crx } from '@crxjs/vite-plugin'
import manifest from './manifest'
import uno from 'unocss/vite'
import { r } from './src/scripts'
import devtools from 'solid-devtools/vite'
import { writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { execSync, spawn } from 'node:child_process'
import type { Plugin } from 'vite'

const GLEAM_DIR = resolve(__dirname, 'gleam')

function gleamPlugin(): Plugin {
  return {
    name: 'gleam',
    buildStart() {
      if (!this.meta.watchMode) {
        return
      }
      execSync('gleam build --target javascript --no-print-progress', {
        cwd: GLEAM_DIR,
        stdio: 'inherit',
      })
    },
    configureServer(server) {
      server.watcher.add(resolve(GLEAM_DIR, 'src/**/*.gleam'))
      server.watcher.on('change', (file) => {
        if (!file.endsWith('.gleam')) {
          return
        }
        const proc = spawn('gleam', ['build', '--target', 'javascript'], {
          cwd: GLEAM_DIR,
          stdio: 'inherit',
        })
        proc.on('close', (code) => {
          if (code === 0) {
            server.hot.send({ type: 'full-reload' })
          }
        })
      })
    },
  }
}

export default defineConfig({
  plugins: [
    gleamPlugin(),
    {
      name: 'tide-write',
      configureServer(server) {
        server.middlewares.use('/__tide_write', async (req, res) => {
          if (req.method !== 'POST') {
            res.writeHead(405).end()
            return
          }
          const chunks: Buffer[] = []
          for await (const chunk of req) {
            chunks.push(chunk)
          }
          const { path: filePath, content } = JSON.parse(
            Buffer.concat(chunks).toString(),
          ) as { path: string; content: string }
          const abs = resolve(process.cwd(), filePath)
          if (!abs.startsWith(resolve(process.cwd(), 'src'))) {
            res
              .writeHead(403)
              .end(JSON.stringify({ error: 'path outside src' }))
            return
          }
          await writeFile(abs, content, 'utf-8')
          res
            .writeHead(200, { 'content-type': 'application/json' })
            .end(JSON.stringify({ ok: true }))
        })
      },
    },
    {
      name: 'tide-source-hmr',
      enforce: 'pre',
      configureServer(server) {
        server.watcher.add('src/**/*.jsonata')
        server.watcher.add('src/**/*.htmlegy')
      },
      async handleHotUpdate({ file, server, read }) {
        if (!file.endsWith('.jsonata') && !file.endsWith('.htmlegy')) {
          return
        }
        const srcDir = resolve(__dirname, 'src')
        if (!file.startsWith(srcDir)) {
          return
        }
        const content = await read()
        const relPath = file.slice(srcDir.length + 1)
        server.hot.send({
          type: 'custom',
          event: 'tide:source-update',
          data: { path: relPath, content },
        })
        return []
      },
    },
    crx({
      manifest,
      browser: (process.env.BROWSER as 'chrome' | 'firefox') ?? 'chrome',
    }),
    devtools(),
    solidPlugin(),
    uno(),
  ],
  // root: r("src"),
  resolve: {
    alias: [
      {
        find: '~gleam/',
        replacement: `${GLEAM_DIR}/build/dev/javascript/tide_shared/`,
      },
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
    alias: {
      'webextension-polyfill': resolve(
        __dirname,
        'src/__mocks__/webextension-polyfill.ts',
      ),
    },
    server: {
      deps: {
        inline: ['webext-bridge', 'webextension-polyfill'],
      },
    },
  },
})
