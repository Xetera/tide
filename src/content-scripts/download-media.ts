import type { MediaRef } from '~/protocol/evaluated-resource'

export function downloadCachedMedia(refs: MediaRef[]): Promise<Record<string, ArrayBuffer>> {
  const id = crypto.randomUUID()

  return new Promise((resolve) => {
    function handler(evt: MessageEvent) {
      if (
        !evt.data?.__spatula ||
        evt.data.kind !== 'download-cached-media:response' ||
        evt.data.id !== id
      ) {
        return
      }
      window.removeEventListener('message', handler)
      const map: Record<string, ArrayBuffer> = {}
      for (const { hash, buffer } of evt.data.results as { hash: string; buffer: ArrayBuffer }[]) {
        map[hash] = buffer
      }
      resolve(map)
    }
    window.addEventListener('message', handler)
    window.postMessage(
      { __spatula: true, kind: 'download-cached-media', refs, id },
      '*',
    )
  })
}
