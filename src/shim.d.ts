/// <reference types="chrome" />

declare global {
  // compile time constant
  const __TIDE_MSG_KEY__: string
}

import type { ProtocolWithReturn } from 'webext-bridge'
import type {
  JobParameters,
  RawEntityPatch,
  JobSource,
  SiteSpec,
} from './funnels/types'
import type { PlainLog, ScrapeLog, ScrapeSource } from './shared'
import type { EntityPatch } from './funnels/types'
import type { ScrapeResult } from './funnels/scrape-result'
import type { HeartbeatStatus } from './server/client'
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
    'get-tabs-for-hostname': ProtocolWithReturn<
      { hostname: string },
      Array<{ tabId: number; title: string; url: string }>
    >
    'get-tab-html': ProtocolWithReturn<
      { tabId: number },
      { html: string; url: string } | null
    >
    'url-update': unknown
    'toggle-highlight': void
    'run-job': JobParameters
    'update-sites': SiteSpec[]
    'toggle-site': ProtocolWithReturn<{ site: SiteSpec; enabled: boolean }, void>
    start: unknown
    log:
      | Omit<PlainLog, 'date' | 'id' | 'type'>
      | Omit<ScrapeLog, 'date' | 'id' | 'status'>
    sites: ProtocolWithReturn<unknown, SiteSpec[]>
    'set-schema': ProtocolWithReturn<SiteSpec[], void>
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
    'get-captures': ProtocolWithReturn<{ hostname: string }, CaptureEntry[]>
    'set-recording': ProtocolWithReturn<
      { hostname: string; enabled: boolean },
      void
    >
    'get-recording': ProtocolWithReturn<
      void,
      { hostname: string; enabled: boolean } | null
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
    'create-funnel': ProtocolWithReturn<
      { site: string; name: string; format: 'jsonata' | 'htmlegy' },
      { ok: true; path: string } | { ok: false; error: string }
    >
    'generate-jsonata': ProtocolWithReturn<
      { captureId: string; currentExpression: string; userNote?: string },
      | { ok: true; expression: string; explanation: string }
      | { ok: false; error: string }
    >
    'pool-sites': ProtocolWithReturn<void, SiteSpec[]>
    heartbeat: ProtocolWithReturn<void, HeartbeatStatus>
    'generate-htmlegy': ProtocolWithReturn<
      {
        html: string
        entity: string
        currentExpression: string
        userNote?: string
      },
      { ok: true; expression: string } | { ok: false; error: string }
    >
  }
}
