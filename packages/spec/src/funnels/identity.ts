export type MediaRecord = { url: string }

export class IdentityError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'IdentityError'
  }
}

export function getQueryParam(url: string, param: string): string | null {
  try {
    return new URL(url).searchParams.get(param)
  } catch {
    return null
  }
}

export function base64DecodeString(encoded: string): string | null {
  try {
    return atob(encoded)
  } catch {
    return null
  }
}
