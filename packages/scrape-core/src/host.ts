export interface ScrapeLogEntry {
  severity: 'error' | 'info'
  text: string
  data?: unknown
}

export interface ScrapeLogger {
  log(entry: ScrapeLogEntry): void
}

export interface RawCapture {
  url: string
  method: string
  body: string
  requestBody: string | null
  requestHeaders: Record<string, string>
  responseHeaders: Record<string, string>
  status: number
  capturedAt: number
}

export interface RawCaptureEcho {
  url: string
  method: string
  status: number
  requestBody: string | null
  responseBody: string
  requestHeaders: Record<string, string>
  responseHeaders: Record<string, string>
  capturedAt: number
}

export interface NetworkTransport {
  /**
   * Registers a handler for captured requests. Returns a function that removes
   * the handler; callers MUST call it to tear the subscription down, otherwise
   * the handler leaks for the lifetime of the transport (e.g. a re-subscribe on
   * every SPA navigation would accumulate listeners).
   */
  subscribe(handler: (capture: RawCapture) => void): () => void
  rebroadcast(echo: RawCaptureEcho): void
}
