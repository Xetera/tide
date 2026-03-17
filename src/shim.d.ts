/// <reference types="chrome" />

import type { ProtocolWithReturn } from 'webext-bridge'
import type { ScrapedPage } from './content-scripts/page-manager'
import type { Resource } from './protocol/spatula'
import type { JobParameters } from './protocol/spatula'
import type { Log } from './shared'
declare module 'webext-bridge' {
  export interface ProtocolMap {
    'url-update': unknown
    // to specify the return type of the message,
    // use the `ProtocolWithReturn` type wrapper
    'run-job': JobParameters
    'page-match': ProtocolWithReturn<ScrapedPage>
    'update-resources': Resource[]
    start: unknown
    log: Omit<Log, 'date' | 'type' | 'id'>
    resources: ProtocolWithReturn<unknown, Resource[]>
    'set-schema': ProtocolWithReturn<Resource[], void>
  }
}
