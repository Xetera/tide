export function matchesGlob(pattern: string, pathname: string): boolean {
  try {
    return new URLPattern({ pathname: pattern }).test({ pathname })
  } catch {
    return false
  }
}
