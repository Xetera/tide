/// <reference types="chrome" />

/// <reference types="chrome" />

import type { ProtocolWithReturn } from 'webext-bridge'
import type {
  JobParameters,
  RawEntityPatch,
  JobSource,
} from './site-spec/types'
import type { PlainLog, ScrapeLog, ScrapeSource } from './shared'
import type { EntityPatch } from './site-spec/types'
import type { ScrapeResult } from './extraction/scrape-result'
import type {
  CaptureEntry,
  GenerationRequest,
  GenerationResult,
  FunnelMatchResult,
  FunnelInfo,
} from './generation/types'
declare module 'webext-bridge' {
  export interface ProtocolMap {
    'open-tab': { url: string }
    'get-tabs-for-hostname': ProtocolWithReturn<{ hostname: string }, Array<{ tabId: number; title: string; url: string }>>
    'get-tab-html': ProtocolWithReturn<{ tabId: number }, { html: string; url: string } | null>
    'url-update': unknown
    'toggle-highlight': void
    'run-job': JobParameters
    'update-resources': Resource[]
    start: unknown
    log: Omit<PlainLog, 'date' | 'id' | 'type'> | Omit<ScrapeLog, 'date' | 'id' | 'status'>
    resources: ProtocolWithReturn<unknown, Resource[]>
    'set-schema': ProtocolWithReturn<Resource[], void>
    'entity-patches': ScrapeResult
    'raw-capture': {
      url: string
      method: string
      status: number
      requestBody: string | null
      responseBody: string
      requestHeaders: Record<string, string>
      responseHeaders: Record<string, string>
      capturedAt: number
    }
    'get-captures': ProtocolWithReturn<
      { hostname: string; request?: { method: string; url: string | string[] } },
      CaptureEntry[]
    >
    'generate-spec': ProtocolWithReturn<GenerationRequest, GenerationResult>
    'match-capture': ProtocolWithReturn<
      { captureId: string },
      FunnelMatchResult[]
    >
    'get-funnels': ProtocolWithReturn<void, FunnelInfo[]>
    'write-funnel': ProtocolWithReturn<
      { path: string; content: string },
      { ok: boolean; error?: string }
    >
    'generate-jsonata': ProtocolWithReturn<
      { captureId: string; currentExpression: string; userNote?: string },
      | { ok: true; expression: string; explanation: string }
      | { ok: false; error: string }
    >
  }
}
