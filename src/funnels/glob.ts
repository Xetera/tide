export function matchesGlob(pattern: string, pathname: string): boolean {
  const escaped = pattern
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*/g, '[^/]*')
    .replace(/\*\*/g, '.*')
  return new RegExp(`^${escaped}$`).test(pathname)
}
