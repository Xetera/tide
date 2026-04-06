/// <reference types="chrome" />

/// <reference types="chrome" />


import type { ProtocolWithReturn } from 'webext-bridge'
import type { JobParameters, EntityPatch, JobSource } from './site-spec/types'
import type { PlainLog, ScrapeLog } from './shared'
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
    'entity-patches': { patches: EntityPatch[]; source: JobSource; warnings: string[]; loader?: { name: string; file: string } }
  }
}
