import { JsonataExpression } from '@tide/jsonata'
import type {
  EntityValidator,
  NetworkFunnelGroup,
  ScrapeResult,
  SiteDefinition,
} from '@tide/spec'
import type { NetworkTransport, RawCapture } from './host'

export class NetworkCapture {
  #funnels: NetworkFunnelGroup[]
  #siteIdByHostname: Map<string, string>
  #validator: EntityValidator
  #onResult: (result: ScrapeResult) => void
  #transport: NetworkTransport
  #origin: string
  #unsubscribe?: () => void

  constructor(
    sites: SiteDefinition[],
    funnels: NetworkFunnelGroup[],
    validator: EntityValidator,
    transport: NetworkTransport,
    origin: string,
    onResult: (result: ScrapeResult) => void,
  ) {
    this.#funnels = funnels
    this.#siteIdByHostname = new Map(sites.map((s) => [s.hostname, s.id]))
    this.#validator = validator
    this.#transport = transport
    this.#origin = origin
    this.#onResult = onResult
  }

  start(): void {
    if (this.#unsubscribe) {
      return
    }
    this.#unsubscribe = this.#transport.subscribe(
      (capture) => void this.#process(capture),
    )
  }

  stop(): void {
    this.#unsubscribe?.()
    this.#unsubscribe = undefined
  }

  updateRules(
    sites: SiteDefinition[],
    funnels: NetworkFunnelGroup[],
  ): void {
    this.#funnels = funnels
    this.#siteIdByHostname = new Map(sites.map((s) => [s.hostname, s.id]))
  }

  async #process(capture: RawCapture): Promise<void> {
    const { url, method, body, requestHeaders, responseHeaders, status, capturedAt, requestBody } = capture

    let parsedUrl: URL
    try {
      parsedUrl = new URL(url, this.#origin)
    } catch {
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

    this.#transport.rebroadcast({
      url,
      method,
      status,
      requestBody,
      responseBody: body,
      requestHeaders,
      responseHeaders,
      capturedAt,
    })
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
