import { defineConfig } from 'vitest/config'
import solidPlugin from 'vite-plugin-solid'
import { crx } from '@crxjs/vite-plugin'
import manifest from './manifest'
import tailwindcss from '@tailwindcss/vite'
import { r } from './src/scripts'
import devtools from 'solid-devtools/vite'
import { readFile, writeFile } from 'node:fs/promises'
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

const TIDE_MSG_KEY = crypto.randomUUID()

export default defineConfig({
  define: {
    __TIDE_MSG_KEY__: JSON.stringify(TIDE_MSG_KEY),
  },
  plugins: [
    {
      name: 'tide-define-main-world',
      transform(code, id) {
        if (!id.includes('network-intercept.ts')) {
          return
        }
        return code.replaceAll('__TIDE_MSG_KEY__', JSON.stringify(TIDE_MSG_KEY))
      },
    },
    gleamPlugin(),
    {
      name: 'tide-adversary',
      configureServer(server) {
        server.middlewares.use('/adversary', async (_req, res) => {
          const html = await readFile(
            resolve(__dirname, 'packages/adversary/index.html'),
            'utf-8',
          )
          res.writeHead(200, { 'content-type': 'text/html' }).end(html)
        })
      },
    },
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
        const srcDir = resolve(__dirname, 'src')
        server.watcher.add('src/**/*.jsonata')
        server.watcher.add('src/**/*.htmlegy')
        const isFunnel = (file: string) =>
          (file.endsWith('.jsonata') || file.endsWith('.htmlegy')) &&
          file.startsWith(srcDir)
        server.watcher.on('add', async (file) => {
          if (!isFunnel(file)) {
            return
          }
          const content = await readFile(file, 'utf-8')
          const relPath = file.slice(srcDir.length + 1)
          server.hot.send({
            type: 'custom',
            event: 'tide:source-update',
            data: { path: relPath, content },
          })
        })
        server.watcher.on('unlink', (file) => {
          if (!isFunnel(file)) {
            return
          }
          const relPath = file.slice(srcDir.length + 1)
          server.hot.send({
            type: 'custom',
            event: 'tide:source-remove',
            data: { path: relPath },
          })
        })
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
    solidPlugin(),
    tailwindcss(),
  ],
  // root: r("src"),
  resolve: {
    alias: [
      {
        find: '~gleam/',
        replacement: `${GLEAM_DIR}/build/dev/javascript/tide_shared/`,
      },
      {
        find: /^~\/funnels\/funnel-loader$/,
        replacement: resolve(r('src'), 'funnels/funnel-loader.vite.ts'),
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
    watch: {
      followSymlinks: false,
      ignored: ['**/node_modules/**', '**/extension/dist/**'],
    },
  },
  build: {
    outDir: r('extension/dist'),
    target: 'esnext',
    sourcemap: true,
  },
  esbuild: {
    minifyIdentifiers: false,
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
