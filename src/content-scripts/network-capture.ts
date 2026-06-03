import { JsonataExpression } from '@tide/jsonata'
import { EntityValidator } from '~/funnels/entity-validator'
import type { NetworkFunnelGroup, SiteDefinition } from '~/funnels/types'
import type { ScrapeResult } from '~/funnels/scrape-result'

interface RawCapture {
  url: string
  method: string
  body: string
  requestBody: string | null
  requestHeaders: Record<string, string>
  responseHeaders: Record<string, string>
  status: number
  capturedAt: number
}

export class NetworkCapture {
  #funnels: NetworkFunnelGroup[]
  #siteIdByHostname: Map<string, string>
  #validator: EntityValidator
  #onResult: (result: ScrapeResult) => void

  constructor(
    sites: SiteDefinition[],
    funnels: NetworkFunnelGroup[],
    onResult: (result: ScrapeResult) => void,
  ) {
    this.#funnels = funnels
    this.#siteIdByHostname = new Map(sites.map((s) => [s.hostname, s.id]))
    this.#validator = new EntityValidator(sites)
    this.#onResult = onResult
    console.log('[tide:capture] NetworkCapture initialized', {
      funnelCount: funnels.length,
      hostname: window.location.hostname,
    })
    window.addEventListener('message', (evt) => {
      if (!evt.data?.[__TIDE_MSG_KEY__] || evt.data.kind !== 'network-capture') {
        return
      }
      console.log('[tide:capture] capture received', evt.data.capture.method, evt.data.capture.url)
      void this.#process(evt.data.capture as RawCapture)
    })
  }

  async #process(capture: RawCapture): Promise<void> {
    const { url, method, body, requestHeaders, responseHeaders, status, capturedAt, requestBody } = capture

    let parsedUrl: URL
    try {
      parsedUrl = new URL(url, window.location.origin)
    } catch {
      console.log('[tide:capture] url parse failed', url)
      return
    }

    let json: unknown
    try {
      json = JSON.parse(body)
    } catch {
      return
    }

    for (const group of this.#funnels) {
      if (!group.matchesRequest(parsedUrl, method)) {
        continue
      }
      console.log('[tide:capture] matched', { name: group.name, url: parsedUrl.pathname })

      for (const funnel of group.funnels) {
        try {
          const expression = new JsonataExpression(funnel.source, {
            request: { url, method, headers: requestHeaders },
            response: { url, status, headers: responseHeaders, body: json },
          })
          const result = await expression.evaluate(json as Record<string, unknown>)
          if (result === undefined) {
            continue
          }
          this.#emit(group, funnel.file, funnel.label, result, json)
        } catch (err) {
          console.warn(`[tide] funnel "${group.name}/${funnel.file}" failed for ${url}:`, err)
        }
      }
    }

    window.postMessage(
      {
        [__TIDE_MSG_KEY__]: true,
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

  #emit(
    group: NetworkFunnelGroup,
    file: string,
    label: string | undefined,
    result: unknown,
    body: unknown,
  ): void {
    const { patches: rawPatches, errors } = this.#validator.parsePatches(result)
    const { patches, warnings } = this.#validator.applyIdentityExprs(rawPatches)

    if (errors.length > 0) {
      console.warn(`[tide] entity validation errors from ${group.name}/${file}`, errors, result, body)
    }
    if (warnings.length > 0) {
      console.warn(`[tide] identity warnings from ${group.name}/${file}`, warnings)
    }
    if (patches.length === 0) {
      return
    }
    const siteId = this.#siteIdByHostname.get(group.hostname) ?? group.hostname
    const patchCounts = new Map<string, number>()
    for (const patch of patches) {
      patchCounts.set(patch._entity, (patchCounts.get(patch._entity) ?? 0) + 1)
    }
    this.#onResult({
      patches,
      source: { kind: 'passive' },
      warnings: [],
      scrapeSource: { kind: 'network', site: siteId, funnel: group.name, file, format: 'jsonata', label },
      highlights: [],
      patchCounts,
      errors: [],
    })
  }
}
