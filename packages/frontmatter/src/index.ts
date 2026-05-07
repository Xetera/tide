import { parse as parseYaml } from 'yaml'

export interface Frontmatter {
  urlPattern?: string | string[]
  [key: string]: unknown
}

const FRONTMATTER_RE = /^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/

export function parseFrontmatter(src: string): { frontmatter: Frontmatter; body: string } {
  const m = src.match(FRONTMATTER_RE)
  if (!m) {
    return { frontmatter: {}, body: src }
  }
  const parsed = parseYaml(m[1]!)
  const frontmatter: Frontmatter =
    parsed != null && typeof parsed === 'object' ? parsed : {}
  return { frontmatter, body: m[2]! }
}
