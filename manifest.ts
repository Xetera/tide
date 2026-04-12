import { defineManifest } from '@crxjs/vite-plugin'

const isFirefox = process.env.BROWSER === 'firefox'

export default defineManifest({
  manifest_version: 3,
  name: 'Spatula',
  version: '1.0.0',
  action: { default_popup: 'index.html' },
  browser_specific_settings: {
    // @ts-expect-error
    gecko: {
      id: 'contact@xetera.dev',
    },
  },
  permissions: [
    'cookies',
    'scripting',
    'declarativeNetRequest',
    'declarativeNetRequestFeedback',
    'webNavigation',
    'storage',
  ],
  optional_host_permissions: ['*://*/*'],
  host_permissions: ['<all_urls>'],
  content_scripts: [
    {
      matches: ['<all_urls>'],
      js: ['src/content-scripts/network-intercept.js'],
      run_at: 'document_start',
      world: 'MAIN',
      all_frames: true,
    },
    {
      matches: ['<all_urls>'],
      js: ['src/content-scripts/asset-capture-main.ts'],
      run_at: 'document_start',
      world: 'MAIN',
      all_frames: true,
    },
    {
      matches: ['<all_urls>'],
      js: ['src/content-scripts/network-capture-main.ts'],
      run_at: 'document_idle',
      world: 'MAIN',
      all_frames: true,
    },
    ...(true
      ? [
          {
            matches: ['<all_urls>'],
            js: ['src/content-scripts/spatula.ts'],
            run_at: 'document_idle' as const,
            all_frames: true,
          },
        ]
      : []),
  ],
  background: isFirefox
    ? { scripts: ['src/background/index.ts'], type: 'module' as const }
    : { service_worker: 'src/background/index.ts' },
  web_accessible_resources: [
    {
      resources: ['scrape-viewer.html', 'playground.html'],
      matches: ['<all_urls>'],
    },
  ],
})
