import { JsonataExpression } from '~/extraction/jsonata-bindings'

interface LoaderExpression {
  file: string
  expression: string
}

interface LoaderRegistration {
  url: string
  method: string
  expressions: LoaderExpression[]
}

interface QueuedRequest {
  url: string
  method: string
  body: string
  headers: Record<string, string>
}

const loaders = new Map<string, LoaderRegistration>()
const queue: QueuedRequest[] = []
let loadersRegistered = false

window.addEventListener('message', (evt) => {
  if (!evt.data?.__spatula) return
  if (evt.data.kind !== 'register-loaders') return

  console.log('registering loaders, queue: ', queue.length)
  const incoming = evt.data.loaders as Record<string, LoaderRegistration>
  for (const [name, loader] of Object.entries(incoming)) {
    loaders.set(name, loader)
  }
  if (!loadersRegistered) {
    loadersRegistered = true
    for (const req of queue) {
      evaluateLoaders(req.url, req.method, req.body, req.headers)
    }
    queue.length = 0
  }
})

function matchesGlob(pattern: string, pathname: string): boolean {
  const escaped = pattern
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*/g, '[^/]*')
    .replace(/\*\*/g, '.*')
  return new RegExp(`^${escaped}$`).test(pathname)
}

async function evaluateLoaders(
  url: string,
  method: string,
  body: string,
  headers: Record<string, string>,
) {
  if (!loadersRegistered) {
    queue.push({ url, method, body, headers })
    return
  }

  let parsedUrl: URL
  try {
    parsedUrl = new URL(url, window.location.origin)
  } catch {
    return
  }

  for (const [name, loader] of loaders) {
    if (loader.method.toUpperCase() !== method.toUpperCase()) continue
    if (!matchesGlob(loader.url, parsedUrl.pathname)) {
      continue
    }

    let json: unknown
    try {
      json = JSON.parse(body)
    } catch {
      console.log('invalid json')
      continue
    }

    for (const { file, expression: expr } of loader.expressions) {
      try {
        const expression = new JsonataExpression(expr, {
          request: { url, method, headers },
          response: { url, status: null, headers, body: json },
        })
        const result = await expression.evaluate(json as Record<string, unknown>)
        if (result === undefined) {
          continue
        }
        window.postMessage(
          { __spatula: true, kind: 'loader-result', name, file, result, url },
          '*',
        )
      } catch (err) {
        console.warn(
          `[spatula] loader "${name}/${file}" failed for ${url}:`,
          err,
          json,
        )
      }
    }
  }
}

window.fetch = new Proxy(window.fetch, {
  apply(target, thisArg, args: Parameters<typeof fetch>) {
    const [input, init] = args
    const url = input instanceof Request ? input.url : input.toString()
    const method = (
      init?.method ??
      (input instanceof Request ? input.method : undefined) ??
      'GET'
    ).toUpperCase()
    const promise = Reflect.apply(target, thisArg, args) as ReturnType<
      typeof fetch
    >
    promise.then((response) => {
      const headers: Record<string, string> = {}
      response.headers.forEach((value, key) => {
        headers[key.toLowerCase()] = value
      })
      response
        .clone()
        .text()
        .then((body) => {
          evaluateLoaders(url, method, body, headers)
          try {
            JSON.parse(body)
          } catch {
            return
          }
          const resolvedUrl = new URL(url, window.location.origin).href
          console.log('[spatula] raw-capture:', method, resolvedUrl)
          const requestHeaders: Record<string, string> = {}
          if (init?.headers) {
            new Headers(init.headers as HeadersInit).forEach((v, k) => {
              requestHeaders[k] = v
            })
          }
          const requestBody =
            init?.body != null
              ? typeof init.body === 'string'
                ? init.body.slice(0, 200_000)
                : '[binary]'
              : null
          window.postMessage(
            {
              __spatula: true,
              kind: 'raw-capture',
              url: resolvedUrl,
              method,
              status: response.status,
              requestBody,
              responseBody: body,
              requestHeaders,
              responseHeaders: headers,
              capturedAt: Date.now(),
            },
            '*',
          )
        })
    })
    return promise
  },
})

XMLHttpRequest.prototype.open = new Proxy(XMLHttpRequest.prototype.open, {
  apply(
    target,
    thisArg: XMLHttpRequest,
    args: Parameters<XMLHttpRequest['open']>,
  ) {
    ;(thisArg as any).__spatula_url = args[1].toString()
    ;(thisArg as any).__spatula_method = (args[0] ?? 'GET')
      .toString()
      .toUpperCase()
    return Reflect.apply(target, thisArg, args)
  },
})

XMLHttpRequest.prototype.send = new Proxy(XMLHttpRequest.prototype.send, {
  apply(
    target,
    thisArg: XMLHttpRequest,
    args: Parameters<XMLHttpRequest['send']>,
  ) {
    thisArg.addEventListener('load', function () {
      const headers: Record<string, string> = {}
      const raw = thisArg.getAllResponseHeaders()
      for (const line of raw.trim().split('\r\n')) {
        const idx = line.indexOf(': ')
        if (idx !== -1) {
          headers[line.slice(0, idx).toLowerCase()] = line.slice(idx + 2)
        }
      }
      const xhrUrl = new URL((thisArg as any).__spatula_url as string, window.location.origin).href
      const xhrMethod = ((thisArg as any).__spatula_method ?? 'GET') as string
      evaluateLoaders(xhrUrl, xhrMethod, thisArg.responseText, headers)
      try {
        JSON.parse(thisArg.responseText)
      } catch {
        return
      }
      const requestBody =
        typeof args[0] === 'string' ? args[0].slice(0, 200_000) : null
      window.postMessage(
        {
          __spatula: true,
          kind: 'raw-capture',
          url: xhrUrl,
          method: xhrMethod,
          status: thisArg.status,
          requestBody,
          responseBody: thisArg.responseText,
          requestHeaders: {},
          responseHeaders: headers,
          capturedAt: Date.now(),
        },
        '*',
      )
    })
    return Reflect.apply(target, thisArg, args)
  },
})

export default {}
