import type { PipeArg } from './parser'

export interface HtmlegyProvider<N> {
  querySelector(node: N, selector: string): N | null
  querySelectorAll(node: N, selector: string): N[]

  getContextHtml(node: N): string
  getTagName(node: N): string

  getText(node: N): string | null
  getInnerText?(node: N): string | null
  getTextContent?(node: N): string | null
  getLines?(node: N): string[] | null
  getAttribute(node: N, name: string): string | null

  resolveUrl(url: string): string

  evaluateJsonata?(source: string, value: unknown): Promise<unknown>

  watch(node: N, selector: string | null, cb: () => void): () => void
  await(node: N, condition: string | null, cb: (node: N) => void): () => void

  pipeOps: Record<string, (node: N, args: PipeArg[], locale: string) => unknown>
}
