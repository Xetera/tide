import type { CaptureEntry } from '~/generation/types'
import { sessionStorageArea } from '~/shared/storage'

const CAPTURE_RING_MAX = 10

async function getCaptureIndex(hostname: string): Promise<string[]> {
  const result = await sessionStorageArea().get({
    [`capture-index:${hostname}`]: [],
  })
  return result[`capture-index:${hostname}`] as string[]
}

export async function getCaptureById(id: string): Promise<CaptureEntry | undefined> {
  const result = await sessionStorageArea().get(`capture:${id}`)
  return result[`capture:${id}`] as CaptureEntry | undefined
}

export async function getCapturesForHostname(hostname: string): Promise<CaptureEntry[]> {
  const ids = await getCaptureIndex(hostname)
  const entries = await Promise.all(ids.map(getCaptureById))
  return entries.filter((e): e is CaptureEntry => e !== undefined)
}

export async function storeCaptureEntry(entry: CaptureEntry): Promise<void> {
  const ids = await getCaptureIndex(entry.hostname)
  const next = [entry.id, ...ids.filter((id) => id !== entry.id)].slice(
    0,
    CAPTURE_RING_MAX,
  )
  const evicted = ids.filter((id) => !next.includes(id))
  await sessionStorageArea().set({
    [`capture:${entry.id}`]: entry,
    [`capture-index:${entry.hostname}`]: next,
  })
  if (evicted.length > 0) {
    await sessionStorageArea().remove(evicted.map((id) => `capture:${id}`))
  }
}
