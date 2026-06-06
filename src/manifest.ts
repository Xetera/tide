import { defineManifest } from '@crxjs/vite-plugin'
import { version } from '../package.json'

const isFirefox = process.env.BROWSER === 'firefox'
const isDev = process.env.NODE_ENV === 'development'

const devContentScripts: chrome.runtime.ManifestV3['content_scripts'] = isDev
  ? [
      {
        js: ['src/content-scripts/network-intercept.ts'],
        matches: ['http://localhost/*'],
        run_at: 'document_start',
        world: 'MAIN',
        all_frames: true,
      },
      // {
      //   js: ['src/content-scripts/asset-capture-main.ts'],
      //   matches: ['http://localhost/*'],
      //   run_at: 'document_start',
      //   world: 'MAIN',
      //   all_frames: true,
      // },
      {
        js: ['src/content-scripts/tide.ts'],
        matches: ['http://localhost/*'],
        run_at: 'document_idle',
        all_frames: true,
      },
    ]
  : []

export default defineManifest({
  manifest_version: 3,
  name: 'Tide',
  version,
  icons: {
    16: 'src/assets/icon-16.png',
    32: 'src/assets/icon-32.png',
    48: 'src/assets/icon-48.png',
    128: 'src/assets/icon-128.png',
  },
  action: {
    default_popup: 'views/index.html',
    default_icon: {
      16: 'src/assets/icon-16.png',
      32: 'src/assets/icon-32.png',
      48: 'src/assets/icon-48.png',
      128: 'src/assets/icon-128.png',
    },
  },
  browser_specific_settings: {
    gecko: {
      id: 'contact@xetera.dev',
      data_collection_permissions: {
        required: ['websiteContent'],
      },
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
  content_scripts: devContentScripts,
  background: isFirefox
    ? { scripts: ['src/background/index.ts'], type: 'module' }
    : { service_worker: 'src/background/index.ts', type: 'module' },
  web_accessible_resources: [
    {
      resources: [
        'views/scrape-viewer.html',
        'views/playground.html',
        'views/onboarding.html',
      ],
      matches: ['<all_urls>'],
      use_dynamic_url: true,
    },
  ],
})
