;(function () {
  if (window.__spatulaQueue) {return}
  window.__spatulaQueue = []
  window.__spatulaFlush = null

  function enqueue(capture) {
    if (window.__spatulaFlush) {
      window.__spatulaFlush(capture)
    } else {
      window.__spatulaQueue.push(capture)
    }
  }

  window.fetch = new Proxy(window.fetch, {
    apply: function (target, thisArg, args) {
      var input = args[0],
        init = args[1]
      var url = input instanceof Request ? input.url : String(input)
      var method = (
        (init && init.method) ||
        (input instanceof Request && input.method) ||
        'GET'
      ).toUpperCase()
      var promise = Reflect.apply(target, thisArg, args)
      promise.then(function (response) {
        var responseHeaders = {}
        response.headers.forEach(function (value, key) {
          responseHeaders[key.toLowerCase()] = value
        })
        response
          .clone()
          .text()
          .then(function (body) {
            try {
              JSON.parse(body)
            } catch (_) {
              return
            }
            var resolvedUrl = new URL(url, window.location.origin).href
            var requestHeaders = {}
            if (init && init.headers) {
              new Headers(init.headers).forEach(function (v, k) {
                requestHeaders[k] = v
              })
            }
            var requestBody =
              init && init.body != null
                ? typeof init.body === 'string'
                  ? init.body.slice(0, 200000)
                  : '[binary]'
                : null
            enqueue({
              url: resolvedUrl,
              method: method,
              body: body,
              requestBody: requestBody,
              requestHeaders: requestHeaders,
              responseHeaders: responseHeaders,
              status: response.status,
              capturedAt: Date.now(),
            })
          })
      })
      return promise
    },
  })

  XMLHttpRequest.prototype.open = new Proxy(XMLHttpRequest.prototype.open, {
    apply: function (target, thisArg, args) {
      thisArg.__spatula_url = String(args[1])
      thisArg.__spatula_method = (args[0] || 'GET').toUpperCase()
      return Reflect.apply(target, thisArg, args)
    },
  })

  XMLHttpRequest.prototype.send = new Proxy(XMLHttpRequest.prototype.send, {
    apply: function (target, thisArg, args) {
      thisArg.addEventListener('load', function () {
        try {
          JSON.parse(thisArg.responseText)
        } catch (_) {
          return
        }
        var headers = {}
        var raw = thisArg.getAllResponseHeaders()
        raw
          .trim()
          .split('\r\n')
          .forEach(function (line) {
            var idx = line.indexOf(': ')
            if (idx !== -1) {
              headers[line.slice(0, idx).toLowerCase()] = line.slice(idx + 2)
            }
          })
        var xhrUrl = new URL(thisArg.__spatula_url, window.location.origin).href
        var xhrMethod = thisArg.__spatula_method || 'GET'
        var requestBody =
          typeof args[0] === 'string' ? args[0].slice(0, 200000) : null
        enqueue({
          url: xhrUrl,
          method: xhrMethod,
          body: thisArg.responseText,
          requestBody: requestBody,
          requestHeaders: {},
          responseHeaders: headers,
          status: thisArg.status,
          capturedAt: Date.now(),
        })
      })
      return Reflect.apply(target, thisArg, args)
    },
  })
})()
