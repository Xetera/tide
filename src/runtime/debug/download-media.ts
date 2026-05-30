export interface MediaRef {
  url: string
  dimensions?: { width: number; height: number }
}

export interface DownloadedMedia {
  bytes: number
  mimeType: string
  sha256hash: string
  buffer: ArrayBuffer
}

export type MediaResult = DownloadedMedia

export function downloadCachedMedia(
  refs: MediaRef[],
): Promise<Record<string, DownloadedMedia>> {
  const id = crypto.randomUUID()

  return new Promise((resolve) => {
    function handler(evt: MessageEvent) {
      if (
        !evt.data?.__tide ||
        evt.data.kind !== 'download-cached-media:response' ||
        evt.data.id !== id
      ) {
        return
      }
      window.removeEventListener('message', handler)
      const map: Record<string, DownloadedMedia> = {}
      for (const { hash, buffer, mimeType, sha256hash } of evt.data.results as {
        hash: string
        buffer: ArrayBuffer
        mimeType: string
        sha256hash: string
      }[]) {
        map[hash] = {
          bytes: buffer?.byteLength ?? 0,
          mimeType,
          sha256hash,
          buffer,
        }
      }
      resolve(map)
    }
    window.addEventListener('message', handler)
    window.postMessage(
      { __tide: true, kind: 'download-cached-media', refs, id },
      '*',
    )
  })
}
