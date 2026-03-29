import PQueue from 'p-queue'
import { EVENTS_KEY, generateUID, type Log, type PlainLog, type ScrapeLog } from '~/shared'

const MAX_LOG_RETENTION = 200
const q = new PQueue()

async function get<T>(key: string, defaultValue: T): Promise<T>
async function get<T>(key: string, defaultValue?: T): Promise<T | undefined> {
  const store = await chrome.storage.local.get(key)
  return store[key] ?? defaultValue
}

const set = <T>(key: string, data: T): Promise<void> =>
  chrome.storage.local.set({ [key]: data })

/** Using a promise queue to make sure two writes aren't trying to happen simultaneously */
const push = async <T>(
  key: string,
  data: T,
  options: { trim: number },
): Promise<void> => {
  return q.add(
    async () => {
      const existing = await get<T[]>(key, [])
      existing.unshift(data)
      const trimmed = existing.slice(0, options.trim)
      await set(key, trimmed)
    },
    { throwOnTimeout: true },
  )
}

export function log(payload: Omit<PlainLog, 'date' | 'id' | 'type'> | Omit<ScrapeLog, 'date' | 'id'>) {
  const toPush: Log = {
    id: generateUID(),
    date: Date.now(),
    type: 'plain',
    ...payload,
  } as Log
  push(EVENTS_KEY, toPush, { trim: MAX_LOG_RETENTION })

  const label = 'resourceId' in payload
    ? `Scraped ${payload.resourceId} (${payload.entity})`
    : payload.text
  if (payload.severity === 'error') {
    console.error(label, payload)
  } else if (payload.severity === 'info') {
    console.log(label, payload)
  } else if (payload.severity === 'debug') {
    console.debug(label, payload)
  }
}
