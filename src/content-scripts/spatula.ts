import { sendMessage } from 'webext-bridge/content-script'
import { PageManager } from './page-manager'

;(async () => {
  try {
    console.log('[spatula] init', window.location.href)
    sendMessage('start', undefined, { context: 'background', tabId: 0 })
    console.log('[spatula] getting resources from background...')
    const resources = await sendMessage('resources', void 0, 'background')
    console.log('[spatula] injecting page manager')
    const manager = new PageManager(document, resources)
    await manager.run()
    console.log('[spatula] page manager running')
    console.groupEnd()
  } catch (err) {
    console.error(err)
  }
})()
