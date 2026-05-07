import { HtmlegyExpr } from '@tide/htmlegy'
import type { HtmlegyOptions } from '@tide/htmlegy'
import { domProvider } from './dom-provider'

export { domProvider }
export { HtmlegyExpr } from '@tide/htmlegy'
export type { HtmlegyProvider, HtmlegyOptions } from '@tide/htmlegy'

export function createExpr(
  src: string,
  options?: HtmlegyOptions<Element>,
): HtmlegyExpr<Element> {
  return new HtmlegyExpr(src, domProvider, options)
}
