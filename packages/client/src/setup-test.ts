import { afterAll, afterEach, beforeAll } from 'vitest'
import { server } from './testing-msw'

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }))
afterAll(() => server.close())
afterEach(() => server.resetHandlers())

global.chrome = {
  storage: {
    local: {
      get: async () => ({}),
      set: async () => {},
      QUOTA_BYTES: 10485760,
    } as unknown as typeof chrome.storage.local,
  },
} as typeof chrome
