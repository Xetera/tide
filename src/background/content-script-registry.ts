import networkInterceptUrl from '../content-scripts/network-intercept.ts?script&module'
// import assetCaptureUrl from '../content-scripts/asset-capture-main.ts?script&module'
import tideUrl from '../content-scripts/tide.ts?script'

const CONTENT_SCRIPT_IDS = [
  'tide:network-intercept',
  'tide:asset-capture',
  'tide:main',
] as const

const CONTENT_SCRIPT_DEFS: Omit<
  chrome.scripting.RegisteredContentScript,
  'matches'
>[] = [
  {
    id: 'tide:network-intercept',
    js: [networkInterceptUrl],
    runAt: 'document_start',
    world: 'MAIN',
    allFrames: true,
  },
  // {
  //   id: 'tide:asset-capture',
  //   js: [assetCaptureUrl],
  //   runAt: 'document_start',
  //   world: 'MAIN',
  //   allFrames: true,
  // },
  {
    id: 'tide:main',
    js: [tideUrl],
    runAt: 'document_idle',
    allFrames: true,
  },
]

export async function syncContentScripts(hostnames: string[]): Promise<void> {
  const existing = await chrome.scripting
    .getRegisteredContentScripts({ ids: [...CONTENT_SCRIPT_IDS] })
    .catch(() => [] as chrome.scripting.RegisteredContentScript[])

  const existingIds = new Set(existing.map((s) => s.id))
  const matches = hostnames.map((h) => `*://${h}/*`)

  if (hostnames.length === 0) {
    if (existingIds.size > 0) {
      await chrome.scripting
        .unregisterContentScripts({ ids: [...CONTENT_SCRIPT_IDS] })
        .catch(() => {})
    }
    return
  }

  const toRegister = CONTENT_SCRIPT_DEFS.filter(
    (def) => !existingIds.has(def.id),
  )
  const toUpdate = CONTENT_SCRIPT_DEFS.filter((def) => existingIds.has(def.id))

  await Promise.all([
    toRegister.length > 0
      ? chrome.scripting.registerContentScripts(
          toRegister.map((def) => ({
            ...def,
            matches,
          })) as chrome.scripting.RegisteredContentScript[],
        )
      : Promise.resolve(),
    toUpdate.length > 0
      ? chrome.scripting.updateContentScripts(
          toUpdate.map((def) => ({ id: def.id, matches })),
        )
      : Promise.resolve(),
  ])
}

export async function getGrantedHostnames(): Promise<string[]> {
  const { origins = [] } = await chrome.permissions.getAll()
  return origins.flatMap((o) => {
    try {
      const hostname = new URL(o.replace(/\/\*$/, '')).hostname
      return hostname ? [hostname] : []
    } catch {
      return []
    }
  })
}
