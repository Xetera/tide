import type { MediaRef } from '~/protocol/evaluated-resource'

export interface MediaResult {
  hash: string
  buffer: ArrayBuffer
  mimeType: string
}

export function downloadCachedMedia(
  refs: MediaRef[],
): Promise<Record<string, Omit<MediaResult, 'hash'>>> {
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
      const map: Record<string, Omit<MediaResult, 'hash'>> = {}
      for (const { hash, buffer, mimeType } of evt.data.results as MediaResult[]) {
        map[hash] = { buffer, mimeType }
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
