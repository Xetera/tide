import { sendMessage } from 'webext-bridge/content-script'
import { EntityValidator } from '~/funnels/entity-validator'
import type { SiteDefinition } from '~/funnels/types'
import type { ScrapeResult } from '~/funnels/scrape-result'

let validator: EntityValidator | null = null
let onNetworkResult: ((result: ScrapeResult) => void) | null = null

export function registerFunnels(
  sites: SiteDefinition[],
  onResult: (result: ScrapeResult) => void,
) {
  onNetworkResult = onResult
  validator = new EntityValidator(sites)
}

window.addEventListener('message', (evt) => {
  if (!evt.data?.[__TIDE_MSG_KEY__]) {
    return
  }

  if (evt.data.kind === 'funnel-result') {
    const { name, site, file, label, result, body } = evt.data as {
      name: string
      site: string
      file: string
      label?: string
      result: unknown
      url: string
      body: unknown
    }
    if (!validator) {
      console.error(`funnel-result was called before validator was assigned`)
      return
    }

    const { patches: rawPatches, errors } = validator.parsePatches(result)
    const { patches, warnings } = validator.applyIdentityExprs(rawPatches)

    if (errors.length > 0) {
      console.warn(
        `[tide] entity validation errors from ${name}/${file}`,
        errors,
        result,
        body,
      )
    }
    if (warnings.length > 0) {
      console.warn(`[tide] identity warnings from ${name}/${file}`, warnings)
    }
    if (patches.length > 0) {
      const patchCounts = new Map<string, number>()
      for (const patch of patches) {
        patchCounts.set(
          patch._entity,
          (patchCounts.get(patch._entity) ?? 0) + 1,
        )
      }
      onNetworkResult?.({
        patches,
        source: { kind: 'passive' },
        warnings: [],
        scrapeSource: { kind: 'network', site, funnel: name, file, format: 'jsonata', label },
        highlights: [],
        patchCounts,
        errors: [],
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
