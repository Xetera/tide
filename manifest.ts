import { defineManifest } from '@crxjs/vite-plugin'

const isFirefox = process.env.BROWSER === 'firefox'
const isDev = process.env.NODE_ENV === 'development'

export default defineManifest({
  manifest_version: 3,
  name: 'Tide',
  version: '1.0.1',
  action: { default_popup: 'index.html' },
  browser_specific_settings: {
    // @ts-expect-error
    gecko: {
      id: 'contact@xetera.dev',
    },
  },
  permissions: [
    'alarms',
    'scripting',
    'declarativeNetRequest',
    ...(isDev ? (['declarativeNetRequestFeedback'] as const) : []),
    'webNavigation',
    'storage',
    'tabs',
  ],
  optional_host_permissions: ['*://*/*'],
  background: isFirefox
    ? { scripts: ['src/background/index.ts'], type: 'module' as const }
    : { service_worker: 'src/background/index.ts' },
  web_accessible_resources: [
    {
      resources: ['scrape-viewer.html', 'playground.html'],
      matches: ['<all_urls>'],
      use_dynamic_url: true,
    },
  ],
})
