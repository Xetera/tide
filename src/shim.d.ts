/// <reference types="chrome" />

/// <reference types="chrome" />

import type { ProtocolWithReturn } from 'webext-bridge'
import type {
  JobParameters,
  RawEntityPatch,
  JobSource,
} from './site-spec/types'
import type { PlainLog, ScrapeLog } from './shared'
import type {
  CaptureEntry,
  GenerationRequest,
  GenerationResult,
  LoaderMatchResult,
  LoaderInfo,
} from './generation/types'
declare module 'webext-bridge' {
  export interface ProtocolMap {
    'url-update': unknown
    'toggle-highlight': void
    'run-job': JobParameters
    'update-resources': Resource[]
    start: unknown
    log: Omit<PlainLog, 'date' | 'id' | 'type'> | Omit<ScrapeLog, 'date' | 'id'>
    resources: ProtocolWithReturn<unknown, Resource[]>
    'set-schema': ProtocolWithReturn<Resource[], void>
    'entity-patches': {
      patches: RawEntityPatch[]
      source: JobSource
      warnings: string[]
      loader?: { name: string; file: string }
    }
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
    'get-captures': ProtocolWithReturn<{ hostname: string; request?: { method: string; url: string } }, CaptureEntry[]>
    'generate-spec': ProtocolWithReturn<GenerationRequest, GenerationResult>
    'match-capture': ProtocolWithReturn<{ captureId: string }, LoaderMatchResult[]>
    'get-loaders': ProtocolWithReturn<void, LoaderInfo[]>
    'write-loader': ProtocolWithReturn<{ path: string; content: string }, { ok: boolean; error?: string }>
    'generate-jsonata': ProtocolWithReturn<{ captureId: string; currentExpression: string }, { ok: true; expression: string; explanation: string } | { ok: false; error: string }>
  }
}
