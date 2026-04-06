import { sendMessage } from 'webext-bridge/content-script'
import { EntityValidator } from '~/extraction/entity-validator'
import type { SiteDefinition } from '~/site-spec/types'

let validator: EntityValidator | null = null

export function registerLoaders(sites: SiteDefinition[]) {
  validator = new EntityValidator(sites)
  const loaders: Record<string, { url: string; method: string; expressions: { file: string; expression: string }[] }> = {}
  for (const site of sites) {
    for (const [name, expressions] of Object.entries(site.loaders)) {
      const matcher = site.requests[name]
      if (!matcher) {
        continue
      }
      loaders[name] = { url: matcher.url, method: matcher.method, expressions }
    }
  }
  window.postMessage({ __spatula: true, kind: 'register-loaders', loaders }, '*')
}

window.addEventListener('message', (evt) => {
  if (!evt.data?.__spatula) return
  if (evt.data.kind !== 'loader-result') return

  const { name, file, result, url } = evt.data as { name: string; file: string; result: unknown; url: string }
  const patches = validator?.parsePatches(result, { loader: name, file, url }) ?? []

  if (patches.length > 0) {
    sendMessage('entity-patches', { patches, source: { kind: 'passive' }, warnings: [], loader: { name, file } })
  }
})
