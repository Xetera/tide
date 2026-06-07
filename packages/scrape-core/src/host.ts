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
  subscribe(handler: (capture: RawCapture) => void): void
  rebroadcast(echo: RawCaptureEcho): void
}
