import { IdentityError, type MediaRecord } from '@tide/spec'

export function shbdnImageIdentity(media: MediaRecord): string {
  const re = /\/(?:.+)_([0-9a-z]+)\.[a-z]+$/
  const match = re.exec(media.url)
  if (match && match[1] != null) {
    return match[1]
  }
  throw new IdentityError('url does not match shbdn cdn filename pattern')
}
