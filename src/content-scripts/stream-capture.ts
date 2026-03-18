import type { MediaResult } from './download-media'

async function fetchMedia(
  url: string,
): Promise<{ buffer: ArrayBuffer; mimeType: string; sha256hash: string }> {
  const res = await fetch(url, { cache: 'force-cache' })
  const buffer = await res.arrayBuffer()
  const mimeType = res.headers.get('content-type') ?? 'image/jpeg'
  const hashBuffer = await crypto.subtle.digest('SHA-256', buffer)
  const sha256hash = Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
  return { buffer, mimeType, sha256hash }
}

window.addEventListener('message', async (evt) => {
  if (!evt.data?.__spatula) return

  if (evt.data.kind === 'download-cached-media') {
    const { refs, id } = evt.data as {
      refs: { url: string; hash: string }[]
      id: string
    }
    const results = (
      await Promise.all(
        refs.map(async ({ url, hash }) => {
          try {
            const { buffer, mimeType, sha256hash } = await fetchMedia(url)
            return { hash, buffer, mimeType, sha256hash } satisfies MediaResult & {
              hash: string
              sha256hash: string
            }
          } catch (err) {
            console.warn(`[spatula] failed to capture media ${url}`, err)
            return null
          }
        }),
      )
    ).filter((r) => r !== null)
    const buffers = results.map((r) => r.buffer)
    window.postMessage(
      { __spatula: true, kind: 'download-cached-media:response', id, results },
      '*',
      buffers,
    )
    return
  }

  if (evt.data.kind !== 'stream-end') return

  // const { mimeType, segments, reconstructable } = evt.data as {
  //   mimeType: string
  //   segments: ArrayBuffer[]
  //   reconstructable: boolean
  // }
  // if (!reconstructable) {
  //   console.warn(
  //     `[spatula] missing init segment for ${mimeType}, skipping download`,
  //   )
  //   return
  // }
})
