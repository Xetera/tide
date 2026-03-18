async function fetchMedia(
  url: string,
): Promise<{ buffer: ArrayBuffer; mimeType: string }> {
  const res = await fetch(url, { cache: 'force-cache' })
  const buffer = await res.arrayBuffer()
  const mimeType = res.headers.get('content-type') ?? 'image/jpeg'
  return { buffer, mimeType }
}

function downloadBuffer(url: string, buffer: ArrayBuffer, mimeType: string) {
  const ext = mimeType.split('/')[1]?.split(';')[0] ?? 'jpg'
  const blob = new Blob([buffer], { type: mimeType })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = url.split('/').pop()?.split('?')[0] ?? `spatula-image.${ext}`
  a.click()
  URL.revokeObjectURL(a.href)
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
            const { buffer, mimeType } = await fetchMedia(url)
            downloadBuffer(url, buffer, mimeType)
            return { hash, buffer }
          } catch (err) {
            console.warn(`[spatula] failed to capture media ${url}`, err)
            return null
          }
        }),
      )
    ).filter((r): r is { hash: string; buffer: ArrayBuffer } => r !== null)
    const buffers = results.map((r) => r.buffer)
    window.postMessage(
      { __spatula: true, kind: 'download-cached-media:response', id, results },
      '*',
      buffers,
    )
    return
  }

  if (evt.data.kind !== 'stream-end') return

  const { mimeType, segments, reconstructable } = evt.data as {
    mimeType: string
    segments: ArrayBuffer[]
    reconstructable: boolean
  }
  if (!reconstructable) {
    console.warn(
      `[spatula] missing init segment for ${mimeType}, skipping download`,
    )
    return
  }
  const isVideo = mimeType.startsWith('video/')
  const isAudio = mimeType.startsWith('audio/')
  if (!isVideo && !isAudio) return

  const baseType = mimeType.split(';')[0]
  const ext = isVideo ? 'mp4' : 'm4a'
  const blob = new Blob(segments, { type: baseType })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = `spatula-${isVideo ? 'video' : 'audio'}.${ext}`
  a.click()
  URL.revokeObjectURL(a.href)
})
