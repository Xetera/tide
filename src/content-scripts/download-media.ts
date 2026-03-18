import type { MediaRef } from '~/protocol/evaluated-resource'

export interface MediaResult {
  buffer: ArrayBuffer
  mimeType: string
  sha256hash: string
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
      const map: Record<string, MediaResult> = {}
      for (const { hash, buffer, mimeType, sha256hash } of evt.data
        .results as (MediaResult & { hash: string })[]) {
        map[hash] = { buffer, mimeType, sha256hash }
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
