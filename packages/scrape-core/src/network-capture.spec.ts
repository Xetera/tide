import { describe, it, expect, vi } from 'vitest'
import type { EntityValidator } from '@tide/spec'
import { NetworkCapture } from './network-capture'
import type { NetworkTransport, RawCapture } from './host'

function rawCapture(url: string): RawCapture {
  return {
    url,
    method: 'GET',
    body: '{}',
    requestBody: null,
    requestHeaders: {},
    responseHeaders: {},
    status: 200,
    capturedAt: 0,
  }
}

/**
 * Fake transport that tracks live handlers so a test can assert subscriptions
 * are torn down rather than accumulating across start/stop cycles.
 */
function fakeTransport() {
  const handlers = new Set<(capture: RawCapture) => void>()
  const transport: NetworkTransport = {
    subscribe(handler) {
      handlers.add(handler)
      return () => handlers.delete(handler)
    },
    rebroadcast: vi.fn(),
  }
  return {
    transport,
    get liveHandlers() {
      return handlers.size
    },
    emit(capture: RawCapture) {
      for (const handler of handlers) {
        handler(capture)
      }
    },
  }
}

function makeCapture(transport: NetworkTransport) {
  return new NetworkCapture(
    [],
    [],
    {} as unknown as EntityValidator,
    transport,
    'https://server.com',
    vi.fn(),
  )
}

describe('NetworkCapture lifecycle', () => {
  it('does not subscribe until started', () => {
    const t = fakeTransport()
    makeCapture(t.transport)
    expect(t.liveHandlers).toBe(0)
  })

  it('subscribes on start and unsubscribes on stop', () => {
    const t = fakeTransport()
    const capture = makeCapture(t.transport)
    capture.start()
    expect(t.liveHandlers).toBe(1)
    capture.stop()
    expect(t.liveHandlers).toBe(0)
  })

  it('does not accumulate subscriptions across start/stop cycles', () => {
    const t = fakeTransport()
    const capture = makeCapture(t.transport)
    for (let i = 0; i < 5; i++) {
      capture.start()
      capture.stop()
    }
    capture.start()
    expect(t.liveHandlers).toBe(1)
  })

  it('is idempotent on repeated start', () => {
    const t = fakeTransport()
    const capture = makeCapture(t.transport)
    capture.start()
    capture.start()
    expect(t.liveHandlers).toBe(1)
  })

  it('stops forwarding captures after stop', async () => {
    const t = fakeTransport()
    const rebroadcast = t.transport.rebroadcast as ReturnType<typeof vi.fn>
    const capture = makeCapture(t.transport)
    capture.start()
    t.emit(rawCapture('https://server.com/a'))
    capture.stop()
    t.emit(rawCapture('https://server.com/b'))
    await Promise.resolve()
    expect(rebroadcast).toHaveBeenCalledTimes(1)
  })
})
