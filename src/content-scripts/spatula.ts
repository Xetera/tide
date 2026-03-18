import { onMessage, sendMessage } from 'webext-bridge/content-script'
import { PageManager } from './page-manager'
import './stream-capture'

;(async () => {
  try {
    console.log('[spatula] init', window.location.href)
    sendMessage('start', undefined, { context: 'background', tabId: 0 })

    let manager: PageManager | undefined
    onMessage('url-update', () => manager?.run())
    onMessage('update-resources', ({ data }) => {
      if (manager) {
        manager.updateResourcesAndRun(document, data)
      }
    })

    console.log('[spatula] getting resources from background...')
    const resources = await sendMessage('resources', void 0, 'background')
    console.log('[spatula] injecting page manager')
    manager = new PageManager(document, resources)
    await manager.run()
    console.log('[spatula] page manager running')
    console.groupEnd()
  } catch (err) {
    console.error(err)
  }
})()
