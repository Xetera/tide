import { JsonataExpression } from '~/extraction/jsonata-bindings'
import { matchesGlob } from '~/extraction/glob'

interface FunnelEntry {
  file: string
  source: string
  format: 'jsonata' | 'htmlegy'
  label?: string
}

interface FunnelRegistration {
  site: string
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
    __tide?: {
      setFlush: (fn: (capture: QueuedCapture) => void) => void
    }
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
  console.log('[tide:capture] register-funnels received', {
    count: funnels.size,
    names: [...funnels.keys()],
    hostname: window.location.hostname,
  })
  if (!funnelsRegistered) {
    funnelsRegistered = true
    window.__tide?.setFlush((capture) => {
      void processCapture(capture)
    })
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
    console.log('[tide:capture] url parse failed', url)
    return
  }

  console.log('[tide:capture] processing', {
    method,
    url,
    pathname: parsedUrl.pathname,
    funnelCount: funnels.size,
    funnels: [...funnels.entries()].map(([n, f]) => ({
      name: n,
      method: f.method,
      url: f.url,
    })),
  })

  for (const [name, funnel] of funnels) {
    if (funnel.method.toUpperCase() !== method.toUpperCase()) {
      console.log('[tide:capture] method mismatch', {
        name,
        funnelMethod: funnel.method,
        requestMethod: method,
      })
      continue
    }
    if (!matchesGlob(funnel.url, parsedUrl.pathname)) {
      console.log('[tide:capture] url mismatch', {
        name,
        funnelUrl: funnel.url,
        pathname: parsedUrl.pathname,
      })
      continue
    }
    console.log('[tide:capture] matched', { name, url: parsedUrl.pathname })

    for (const { file, source: expr, label } of funnel.funnels) {
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
        const result = await expression.evaluate(
          json as Record<string, unknown>,
        )

        if (result === undefined) {
          continue
        }
        window.postMessage(
          {
            __tide: true,
            kind: 'funnel-result',
            name,
            site: funnel.site,
            file,
            label,
            result,
            url,
            body: rawBody,
          },
          '*',
        )
      } catch (err) {
        console.warn(`[tide] funnel "${name}/${file}" failed for ${url}:`, err)
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
