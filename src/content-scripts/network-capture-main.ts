import { JsonataExpression } from '~/extraction/jsonata-bindings'
import { matchesGlob } from '~/extraction/glob'

interface LoaderExpression {
  file: string
  expression: string
  format: 'jsonata' | 'htmlevate'
}

interface LoaderRegistration {
  url: string
  method: string
  expressions: LoaderExpression[]
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
    __spatulaQueue: QueuedCapture[]
    __spatulaFlush: ((capture: QueuedCapture) => void) | null
  }
}

const loaders = new Map<string, LoaderRegistration>()
let loadersRegistered = false

window.addEventListener('message', (evt) => {
  if (!evt.data?.__spatula) {
    return
  }
  if (evt.data.kind !== 'register-loaders') {
    return
  }

  const incoming = evt.data.loaders as Record<string, LoaderRegistration>
  for (const [name, loader] of Object.entries(incoming)) {
    loaders.set(name, loader)
  }
  if (!loadersRegistered) {
    loadersRegistered = true
    window.__spatulaFlush = (capture) => {
      void processCapture(capture)
    }
    for (const capture of window.__spatulaQueue ?? []) {
      void processCapture(capture)
    }
    window.__spatulaQueue = []
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

  for (const [name, loader] of loaders) {
    if (loader.method.toUpperCase() !== method.toUpperCase()) {
      continue
    }
    if (!matchesGlob(loader.url, parsedUrl.pathname)) {
      continue
    }

    for (const { file, expression: expr, format } of loader.expressions) {
      try {
        let result: unknown
        let rawBody: unknown = body

        if (format === 'htmlevate') {
          const { compile } = await import('~/htmlevate/compiler')
          const fn = compile(expr)
          const parser = new DOMParser()
          const doc = parser.parseFromString(body, 'text/html')
          result = fn(doc.documentElement)
        } else {
          let json: unknown
          try {
            json = JSON.parse(body)
          } catch {
            continue
          }
          rawBody = json
          const expression = new JsonataExpression(expr, {
            request: { url, method, headers: requestHeaders },
            response: { url, status, headers: responseHeaders, body: json },
          })
          result = await expression.evaluate(json as Record<string, unknown>)
        }

        if (result === undefined) {
          continue
        }
        window.postMessage(
          {
            __spatula: true,
            kind: 'loader-result',
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
          `[spatula] loader "${name}/${file}" failed for ${url}:`,
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
      __spatula: true,
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
