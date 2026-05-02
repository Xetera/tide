import { sendMessage } from 'webext-bridge/content-script'
import { EntityValidator } from '~/extraction/entity-validator'
import type { SiteDefinition } from '~/site-spec/types'

let validator: EntityValidator | null = null

export function registerLoaders(sites: SiteDefinition[]) {
  validator = new EntityValidator(sites)
  const loaders: Record<
    string,
    {
      url: string
      method: string
      expressions: {
        file: string
        expression: string
        format: 'jsonata' | 'htmlevate'
      }[]
    }
  > = {}
  for (const site of sites) {
    for (const { name, url, method, expressions } of site.getNetworkLoaders()) {
      loaders[name] = { url, method, expressions }
    }
  }
  window.postMessage(
    { __spatula: true, kind: 'register-loaders', loaders },
    '*',
  )
}

window.addEventListener('message', (evt) => {
  if (!evt.data?.__spatula) {
    return
  }

  if (evt.data.kind === 'loader-result') {
    const { name, file, result, url, body } = evt.data as {
      name: string
      file: string
      result: unknown
      url: string
      body: unknown
    }
    if (!validator) {
      console.error(`loader-result was called before validator was assigned`)
      return
    }

    const { patches: rawPatches, errors } = validator.parsePatches(result, {
      loader: name,
      file,
      url,
    })
    const { patches, warnings } = validator.applyIdentityExprs(rawPatches)

    if (errors.length > 0) {
      console.warn(
        `[spatula] entity validation errors from ${name}/${file}`,
        errors,
        result,
        body,
      )
    }
    if (warnings.length > 0) {
      console.warn(`[spatula] identity warnings from ${name}/${file}`, warnings)
    }
    if (patches.length > 0) {
      sendMessage('entity-patches', {
        patches,
        source: { kind: 'passive' },
        warnings: [],
        scrapeSource: { kind: 'network', loader: name, file },
      })
    }
  }

  if (evt.data.kind === 'raw-capture') {
    const {
      url,
      method,
      status,
      requestBody,
      responseBody,
      requestHeaders,
      responseHeaders,
      capturedAt,
    } = evt.data as {
      url: string
      method: string
      status: number
      requestBody: string | null
      responseBody: string
      requestHeaders: Record<string, string>
      responseHeaders: Record<string, string>
      capturedAt: number
    }
    sendMessage('raw-capture', {
      url,
      method,
      status,
      requestBody,
      responseBody,
      requestHeaders,
      responseHeaders,
      capturedAt,
    }).catch(() => {})
  }
})
