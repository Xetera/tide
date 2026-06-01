import { parse } from '@tide/htmlegy'
import type { Expr } from '@tide/htmlegy'
import { printDoc } from './doc'
import { printAst } from './print'

export type FormatOptions = { printWidth?: number; indentSize?: number }

const FRONTMATTER_RE = /^(---\r?\n[\s\S]*?\r?\n---\r?\n)([\s\S]*)$/

function splitFrontmatter(src: string): { prefix: string; body: string } {
  const m = src.match(FRONTMATTER_RE)
  if (!m) return { prefix: '', body: src }
  return { prefix: m[1]!, body: m[2]! }
}

export function formatAst(ast: Expr, options: FormatOptions = {}): string {
  return printDoc(printAst(ast), options.printWidth ?? 80, options.indentSize ?? 2) + '\n'
}

export function format(src: string, options: FormatOptions = {}): string {
  const { prefix, body } = splitFrontmatter(src)
  return prefix + formatAst(parse(body), options)
}

export { printAst } from './print'
export { printDoc } from './doc'
