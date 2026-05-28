import { sendMessage } from 'webext-bridge/content-script'
import { EntityValidator } from '~/extraction/entity-validator'
import type { SiteDefinition } from '~/site-spec/types'
import type { ScrapeResult } from '~/extraction/scrape-result'

let validator: EntityValidator | null = null
let onNetworkResult: ((result: ScrapeResult) => void) | null = null

export function registerFunnels(
  sites: SiteDefinition[],
  onResult: (result: ScrapeResult) => void,
) {
  onNetworkResult = onResult
  validator = new EntityValidator(sites)
  const funnels: Record<
    string,
    {
      site: string
      url: string | string[]
      method: string
      funnels: {
        file: string
        source: string
        format: 'jsonata' | 'htmlegy'
      }[]
    }
  > = {}
  for (const site of sites) {
    for (const group of site.getNetworkFunnels()) {
      funnels[group.name] = {
        site: site.id,
        url: group.request.url,
        method: group.request.method,
        funnels: group.funnels.map((l) => ({
          file: l.file,
          source: l.source,
          format: l.format,
          label: l.label,
        })),
      }
    }
  }
  window.postMessage({ __tide: true, kind: 'register-funnels', funnels }, '*')
}

window.addEventListener('message', (evt) => {
  if (!evt.data?.__tide) {
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
