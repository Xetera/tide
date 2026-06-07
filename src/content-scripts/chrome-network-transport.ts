import { sendMessage } from 'webext-bridge/content-script'
import type { NetworkTransport, RawCapture, RawCaptureEcho } from '@tide/scrape-core'

export const chromeNetworkTransport: NetworkTransport = {
  subscribe(handler: (capture: RawCapture) => void): void {
    window.addEventListener('message', (evt) => {
      if (!evt.data?.[__TIDE_MSG_KEY__] || evt.data.kind !== 'network-capture') {
        return
      }
      handler(evt.data.capture as RawCapture)
    })
  },
  rebroadcast(echo: RawCaptureEcho): void {
    sendMessage('raw-capture', {
      url: echo.url,
      method: echo.method,
      status: echo.status,
      requestBody: echo.requestBody,
      responseBody: echo.responseBody,
      requestHeaders: echo.requestHeaders,
      responseHeaders: echo.responseHeaders,
      capturedAt: echo.capturedAt,
    }).catch(() => {})
  },
}
