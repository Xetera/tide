import { defineManifest } from '@crxjs/vite-plugin'

export default defineManifest({
  manifest_version: 3,
  name: 'Spatula',
  version: '1.0.0',
  action: { default_popup: 'index.html' },
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
      js: ['src/content-scripts/asset-capture-main.ts'],
      run_at: 'document_start',
      world: 'MAIN',
      all_frames: true,
    },
    {
      matches: ['<all_urls>'],
      js: ['src/content-scripts/spatula.ts'],
      run_at: 'document_idle',
      all_frames: true,
    },
  ],
  background: { service_worker: 'src/background/index.ts' },
})
