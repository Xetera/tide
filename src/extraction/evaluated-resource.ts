import type {
  EntityPatch,
  PageSpec,
} from '~/site-spec/types'

export interface MediaRef {
  url: string
  hash: string
  offload?: boolean
  urlExpires?: true | string
}

export interface ResolvedMediaField {
  hash: string
  size: number
  content_type: string
  source_url: string
}

export interface DownloadedMedia {
  sha256hash: string
  mimeType: string
  bytes: number
  buffer: ArrayBuffer
}


function resolveMediaRef(
  ref: MediaRef,
  downloaded: Record<string, DownloadedMedia>,
): ResolvedMediaField | MediaRef {
  const result = downloaded[ref.hash]
  if (!result) {
    console.warn('[spatula] failed to resolve media ref, will submit unresolved', {
      url: ref.url,
      hash: ref.hash,
      availableHashes: Object.keys(downloaded),
    })
    return ref
  }
  return {
    hash: result.sha256hash,
    size: result.bytes,
    content_type: result.mimeType,
    source_url: ref.url,
  }
}

function substituteValue(
  value: unknown,
  downloaded: Record<string, DownloadedMedia>,
): unknown {
  if (isMediaRef(value)) return resolveMediaRef(value, downloaded)
  if (Array.isArray(value))
    return value.map((item) => substituteValue(item, downloaded))
  if (typeof value === 'object' && value !== null) {
    return Object.fromEntries(
      Object.entries(value).map(([k, v]) => [
        k,
        substituteValue(v, downloaded),
      ]),
    )
  }
  return value
}

function isMediaRef(value: unknown): value is MediaRef {
  return (
    typeof value === 'object' &&
    value !== null &&
    'url' in value &&
    'hash' in value &&
    typeof value.url === 'string' &&
    typeof value.hash === 'string'
  )
}

export class EvaluatedResource {
  constructor(
    readonly resource: PageSpec,
    readonly patches: readonly EntityPatch[],
  ) {}

  mediaUrls(): MediaRef[] {
    const out: MediaRef[] = []
    for (const patch of this.patches) {
      collectMediaRefs(patch, out)
    }
    return out
  }

  substituteMediaRefs(
    downloaded: Record<string, DownloadedMedia>,
  ): EntityPatch[] {
    return this.patches.map((patch) => substituteValue(patch, downloaded) as EntityPatch)
  }
}

function collectMediaRefs(value: unknown, out: MediaRef[]): void {
  if (isMediaRef(value)) {
    out.push(value)
  } else if (Array.isArray(value)) {
    for (const item of value) collectMediaRefs(item, out)
  } else if (typeof value === 'object' && value !== null) {
    for (const v of Object.values(value)) collectMediaRefs(v, out)
  }
}
