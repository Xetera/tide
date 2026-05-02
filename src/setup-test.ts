import { afterAll, afterEach, beforeAll } from 'vitest'
import { server } from './msw'

// Start server before all tests
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }))

//  Close server after all tests
afterAll(() => server.close())

// Reset handlers after each test `important for test isolation`
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
