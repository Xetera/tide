import { JsonataExpression } from '~/extraction/jsonata-bindings'
import { matchesGlob } from '~/extraction/glob'

interface FunnelEntry {
  file: string
  source: string
  format: 'jsonata' | 'htmlevate'
}

interface FunnelRegistration {
  url: string
  method: string
  funnels: FunnelEntry[]
}

interface QueuedCapture {
  url: string
  method: string
  body: string
  requestBody: string | null
  requestHeaders: Record<string, string>
  responseHeaders: Record<string, string>
  status: number
  capturedAt: number
}

declare global {
  interface Window {
    __tideQueue: QueuedCapture[]
    __tideFlush: ((capture: QueuedCapture) => void) | null
  }
}

const funnels = new Map<string, FunnelRegistration>()
let funnelsRegistered = false

window.addEventListener('message', (evt) => {
  if (!evt.data?.__tide) {
    return
  }
  if (evt.data.kind !== 'register-funnels') {
    return
  }

  const incoming = evt.data.funnels as Record<string, FunnelRegistration>
  for (const [name, funnel] of Object.entries(incoming)) {
    funnels.set(name, funnel)
  }
  if (!funnelsRegistered) {
    funnelsRegistered = true
    window.__tideFlush = (capture) => {
      void processCapture(capture)
    }
    for (const capture of window.__tideQueue ?? []) {
      void processCapture(capture)
    }
    window.__tideQueue = []
  }
})

async function processCapture(capture: QueuedCapture) {
  const {
    url,
    method,
    body,
    requestHeaders,
    responseHeaders,
    status,
    capturedAt,
    requestBody,
  } = capture

  let parsedUrl: URL
  try {
    parsedUrl = new URL(url, window.location.origin)
  } catch {
    return
  }

  for (const [name, funnel] of funnels) {
    if (funnel.method.toUpperCase() !== method.toUpperCase()) {
      continue
    }
    if (!matchesGlob(funnel.url, parsedUrl.pathname)) {
      continue
    }

    for (const { file, source: expr } of funnel.funnels) {
      try {
        let json: unknown
        try {
          json = JSON.parse(body)
        } catch {
          continue
        }
        const rawBody = json
        const expression = new JsonataExpression(expr, {
          request: { url, method, headers: requestHeaders },
          response: { url, status, headers: responseHeaders, body: json },
        })
        const result = await expression.evaluate(json as Record<string, unknown>)

        if (result === undefined) {
          continue
        }
        window.postMessage(
          {
            __tide: true,
            kind: 'funnel-result',
            name,
            file,
            result,
            url,
            body: rawBody,
          },
          '*',
        )
      } catch (err) {
        console.warn(
          `[tide] funnel "${name}/${file}" failed for ${url}:`,
          err,
        )
      }
    }
  }

  try {
    JSON.parse(body)
  } catch {
    return
  }
  window.postMessage(
    {
      __tide: true,
      kind: 'raw-capture',
      url,
      method,
      status,
      requestBody,
      responseBody: body,
      requestHeaders,
      responseHeaders,
      capturedAt,
    },
    '*',
  )
}

export default {}
