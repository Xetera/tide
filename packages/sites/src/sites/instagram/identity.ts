import {
  IdentityError,
  base64DecodeString,
  getQueryParam,
  type MediaRecord,
} from '@tide/spec'

function instagramImageIdentityFromCacheKey(url: string): string {
  const cacheKey = getQueryParam(url, 'ig_cache_key')
  if (cacheKey == null) {
    throw new IdentityError('missing ig_cache_key query param')
  }
  const b64 = cacheKey.split('.')[0]
  if (b64 == null) {
    throw new IdentityError('ig_cache_key has no segments')
  }
  const decoded = base64DecodeString(b64)
  if (decoded == null) {
    throw new IdentityError('failed to base64 decode ig_cache_key')
  }
  return decoded
}

function instagramImageIdentityFromFilename(url: string): string {
  // no clue if this is actually the identity or what the other fields represent
  const re = /\/v\/t[0-9.\-]+\/([0-9]+_[0-9]+_[0-9]+)_n\.[a-z]+/
  const match = re.exec(url)
  if (match && match[1] != null) {
    return match[1]
  }
  throw new IdentityError('url does not match instagram cdn filename pattern')
}

export function instagramImageIdentity(media: MediaRecord): string {
  try {
    return instagramImageIdentityFromCacheKey(media.url)
  } catch {
    return instagramImageIdentityFromFilename(media.url)
  }
}

function instagramVideoIdentityFromEfg(url: string): string {
  const efg = getQueryParam(url, 'efg')
  if (efg == null) {
    throw new IdentityError('missing efg query param')
  }
  const decoded = base64DecodeString(efg)
  if (decoded == null) {
    throw new IdentityError('failed to base64 decode efg')
  }
  // xpv_asset_id is a 64-bit id that overflows JS number precision, so the raw
  // digits are extracted from the decoded JSON instead of parsing it as a number
  const match = /"xpv_asset_id"\s*:\s*(\d+)/.exec(decoded)
  if (!match || match[1] === null) {
    throw new IdentityError('xpv_asset_id not found in efg')
  }
  return match[1]!
}

export function instagramVideoIdentity(media: MediaRecord): string {
  try {
    return instagramVideoIdentityFromEfg(media.url)
  } catch {
    return instagramImageIdentity(media)
  }
}
