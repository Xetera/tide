import * as ohm from 'ohm-js'
import type { NonterminalNode, IterationNode, TerminalNode } from 'ohm-js'
import type { HTMLegyActionDict, HTMLegySemantics } from './grammar.ohm-bundle'
import grammarSrc from './grammar.ohm?raw'

const grammar = ohm.grammar(
  grammarSrc,
) as unknown as import('./grammar.ohm-bundle').HTMLegyGrammar

export type Span = { start: number; end: number }

export type Comment = { start: number; end: number; text: string }

export type Trivia = { leading: Comment[]; trailing: Comment[] }

export type Spanned = { span: Span; leading?: Comment[]; trailing?: Comment[] }

type Bare<T> = T extends unknown ? Omit<T, keyof Spanned> : never

export type Chain = { source: Source; tail: ChainStep[] } & Spanned

export type Expr = (
  | { kind: 'array'; items: Expr[] }
  | { kind: 'object'; fields: Field[] }
  | { kind: 'match'; source: string | null; arms: MatchArm[] }
  | { kind: 'match_expr'; scrutinee: Expr; arms: ExprMatchArm[] }
  | {
      kind: 'fallback_expr'
      primary: Chain
      fallback: Chain | null
    }
  | { kind: 'literal'; value: unknown }
) &
  Spanned

export type Field = (
  | { dynamic: false; key: string; value: Expr }
  | { dynamic: true; keyExpr: Expr; value: Expr }
  | { expr: true; value: Expr }
) &
  Spanned

export type MatchArm = (
  | { kind: 'each'; selector: string; body: Expr }
  | { kind: 'selector'; selector: string; body: Expr }
  | { kind: 'call'; name: string; expr: Expr; args: PipeArg[]; body: Expr }
  | { kind: 'fallback'; body: Expr }
) &
  Spanned

export type ExprMatchArm = (
  | { kind: 'literal'; value: unknown; body: Expr }
  | { kind: 'pipe'; ops: PipeOp[]; body: Expr }
  | { kind: 'fallback'; body: Expr }
) &
  Spanned

export type Source = (
  | { kind: 'alias_ref'; name: string }
  | { kind: 'alias_each'; name: string; selector: string; requireOne: boolean }
  | { kind: 'alias_single'; name: string; selector: string; omit: boolean }
  | { kind: 'each'; selector: string; requireOne: boolean }
  | { kind: 'single'; selector: string; omit: boolean }
  | { kind: 'context' }
  | { kind: 'positional_ref'; index: number }
  | { kind: 'root_ref' }
  | { kind: 'root_each'; selector: string; requireOne: boolean }
  | { kind: 'root_single'; selector: string; omit: boolean }
  | { kind: 'watch'; inner: Source }
  | { kind: 'await'; condition: string | null; inner: Source }
  | {
      kind: 'func_call'
      name: string
      expr: Expr
      args: PipeArg[]
      exprArgs: Expr[]
    }
  | { kind: 'literal'; value: unknown }
) &
  Spanned

export type ChainStep = (
  | { kind: 'pipe_transform'; op: PipeOp }
  | { kind: 'block'; fields: Field[] }
  | { kind: 'conditional'; then_: Expr; else_: Expr | null }
  | { kind: 'scoped_expr'; expr: Expr }
) &
  Spanned

export type PipeArg =
  | string
  | number
  | { key: string; value: string | number }
  | { key: string; expr: Chain }

export type PipeOp =
  | { name: string; args: PipeArg[] }
  | { name: 'jsonata'; source: string }

type FuncArg = { kind: 'pipe'; value: PipeArg } | { kind: 'expr'; value: Expr }

type AstResult =
  | Bare<Expr>
  | Bare<Field>
  | Bare<MatchArm>
  | Bare<ExprMatchArm>
  | Bare<Source>
  | Bare<Chain>
  | Bare<ChainStep>
  | PipeOp
  | PipeArg
  | FuncArg
  | string
  | number
  | string[]

type WithAst = (NonterminalNode | IterationNode | TerminalNode) & {
  toAst(): AstResult
}
const toAst = (
  node: NonterminalNode | IterationNode | TerminalNode,
): AstResult => (node as WithAst).toAst()

const semantics: HTMLegySemantics = grammar.createSemantics()

const exprActions: HTMLegyActionDict<AstResult> = {
  Expr(e) {
    return e.toAst()
  },

  Array(_l, items, _trailing, _r) {
    return {
      kind: 'array',
      items: items.asIteration().children.map((c) => toAst(c) as Expr),
    } satisfies Bare<Expr>
  },

  Object(_l, fields, _trailing, _r) {
    return {
      kind: 'object',
      fields: fields.asIteration().children.map((c) => toAst(c) as Field),
    } satisfies Bare<Expr>
  },

  Field_static(key, _colon, value) {
    return {
      dynamic: false,
      key: toAst(key) as string,
      value: toAst(value) as Expr,
    } satisfies Bare<Field>
  },
  Field_dynamic(_lb, keyExpr, _rb, _colon, value) {
    return {
      dynamic: true,
      keyExpr: toAst(keyExpr) as Expr,
      value: toAst(value) as Expr,
    } satisfies Bare<Field>
  },
  Field_expr(_lp, fallbackExpr, _rp) {
    return {
      expr: true,
      value: toAst(fallbackExpr) as Expr,
    } satisfies Bare<Field>
  },

  Match_plain(_kw, _l, arms, _r) {
    return {
      kind: 'match',
      source: null,
      arms: arms.children.map((c) => toAst(c) as MatchArm),
    } satisfies Bare<Expr>
  },
  Match_scoped(_kw, sel, _l, arms, _r) {
    const src = toAst(sel) as Source & { kind: 'single' }
    return {
      kind: 'match',
      source: src.selector,
      arms: arms.children.map((c) => toAst(c) as MatchArm),
    } satisfies Bare<Expr>
  },
  Match_expr(_kw, scrutinee, _l, arms, _trailing, _r) {
    return {
      kind: 'match_expr',
      scrutinee: toAst(scrutinee) as Expr,
      arms: arms.asIteration().children.map((c) => toAst(c) as ExprMatchArm),
    } satisfies Bare<Expr>
  },
  MatchScrutinee(primary, _qq, fallback) {
    return {
      kind: 'fallback_expr',
      primary: toAst(primary) as unknown as Chain,
      fallback:
        fallback.children.length > 0
          ? (toAst(fallback.children[0]!) as unknown as Chain)
          : null,
    } satisfies Bare<Expr>
  },
  MatchChain(source, tail) {
    return {
      source: toAst(source) as Source,
      tail: tail.children.map((c) => toAst(c) as ChainStep),
    } satisfies Bare<Chain>
  },
  MatchChainStep(t) {
    return t.toAst()
  },
  ExprMatchArm_literal(lit, _arrow, body) {
    const litExpr = toAst(lit) as Expr & { kind: 'literal' }
    return {
      kind: 'literal',
      value: litExpr.value,
      body: toAst(body) as Expr,
    } satisfies Bare<ExprMatchArm>
  },
  ExprMatchArm_pipe(firstStep, rest, _arrow, body) {
    const firstOp = toAst(firstStep) as PipeOp
    const restSteps = rest.children.map((c) => toAst(c) as ChainStep)
    const ops: PipeOp[] = [firstOp]
    for (const step of restSteps) {
      if (step.kind !== 'pipe_transform') {
        throw new Error('only pipe steps are supported in match arm LHS')
      }
      ops.push(step.op)
    }
    return {
      kind: 'pipe',
      ops,
      body: toAst(body) as Expr,
    } satisfies Bare<ExprMatchArm>
  },
  ArmPipeStep_call(name, _lp, argList, _rp) {
    const args = argList.asIteration().children.map((c) => toAst(c) as PipeArg)
    return { name: name.sourceString, args } satisfies PipeOp
  },
  ArmPipeStep_bare(name) {
    return { name: name.sourceString, args: [] } satisfies PipeOp
  },
  ExprMatchArm_fallback(_ident, _arrow, body) {
    return {
      kind: 'fallback',
      body: toAst(body) as Expr,
    } satisfies Bare<ExprMatchArm>
  },
  ScopedMatchArm_call(funcCall, _arrow, body) {
    const fc = toAst(funcCall) as Source & { kind: 'func_call' }
    return {
      kind: 'call',
      name: fc.name,
      expr: fc.expr,
      args: fc.args,
      body: toAst(body) as Expr,
    } satisfies Bare<MatchArm>
  },
  ScopedMatchArm_fallback(_ident, _arrow, body) {
    return {
      kind: 'fallback',
      body: toAst(body) as Expr,
    } satisfies Bare<MatchArm>
  },
  MatchArm_fallback(_ident, _arrow, body) {
    return {
      kind: 'fallback',
      body: toAst(body) as Expr,
    } satisfies Bare<MatchArm>
  },
  MatchArm_each(sel, _arrow, body) {
    const src = toAst(sel) as Source & { kind: 'each' }
    return {
      kind: 'each',
      selector: src.selector,
      body: toAst(body) as Expr,
    } satisfies Bare<MatchArm>
  },
  MatchArm_selector(sel, _arrow, body) {
    const src = toAst(sel) as Source & { kind: 'single' }
    return {
      kind: 'selector',
      selector: src.selector,
      body: toAst(body) as Expr,
    } satisfies Bare<MatchArm>
  },

  FallbackExpr(primary, _qq, fallback) {
    return {
      kind: 'fallback_expr',
      primary: toAst(primary) as unknown as Chain,
      fallback:
        fallback.children.length > 0
          ? (toAst(fallback.children[0]!) as unknown as Chain)
          : null,
    } satisfies Bare<Expr>
  },

  Chain(source, tail) {
    return {
      source: toAst(source) as Source,
      tail: tail.children.map((c) => toAst(c) as ChainStep),
    } satisfies Bare<Chain>
  },

  Source_watch(_kw, inner) {
    return {
      kind: 'watch',
      inner: toAst(inner) as Source,
    } satisfies Bare<Source>
  },
  Source_awaitCond(_kw, _l, cond, _r, inner) {
    return {
      kind: 'await',
      condition: cond.sourceString.trim(),
      inner: toAst(inner) as Source,
    } satisfies Bare<Source>
  },
  Source_awaitSelf(_kw, inner) {
    return {
      kind: 'await',
      condition: null,
      inner: toAst(inner) as Source,
    } satisfies Bare<Source>
  },

  Source_aliasEach(_at, name, sel) {
    const s = toAst(sel) as Source & { kind: 'each' }
    return {
      kind: 'alias_each',
      name: name.sourceString,
      selector: s.selector,
      requireOne: s.requireOne,
    } satisfies Bare<Source>
  },
  Source_aliasSingle(_at, name, sel) {
    const s = toAst(sel) as Source & { kind: 'single' }
    return {
      kind: 'alias_single',
      name: name.sourceString,
      selector: s.selector,
      omit: s.omit,
    } satisfies Bare<Source>
  },
  Source_aliasRef(_at, name) {
    return { kind: 'alias_ref', name: name.sourceString } satisfies Bare<Source>
  },
  Source_rootEach(_at, sel) {
    const s = toAst(sel) as Source & { kind: 'each' }
    return {
      kind: 'root_each',
      selector: s.selector,
      requireOne: s.requireOne,
    } satisfies Bare<Source>
  },
  Source_rootSingle(_at, sel) {
    const s = toAst(sel) as Source & { kind: 'single' }
    return {
      kind: 'root_single',
      selector: s.selector,
      omit: s.omit,
    } satisfies Bare<Source>
  },
  Source_rootRef(_at) {
    return { kind: 'root_ref' } satisfies Bare<Source>
  },
  Source_literal(lit) {
    const expr = toAst(lit) as Expr & { kind: 'literal' }
    return { kind: 'literal', value: expr.value } satisfies Bare<Source>
  },

  FuncCall(name, _lp, firstExpr, _commas, restArgs, _trailing, _rp) {
    const pipeArgs: PipeArg[] = []
    const exprArgs: Expr[] = []
    for (const c of restArgs.children) {
      const arg = toAst(c) as FuncArg
      if (arg.kind === 'pipe') {
        pipeArgs.push(arg.value)
      } else {
        exprArgs.push(arg.value)
      }
    }
    return {
      kind: 'func_call',
      name: name.sourceString,
      expr: toAst(firstExpr) as Expr,
      args: pipeArgs,
      exprArgs,
    } satisfies Bare<Source>
  },
  FuncArg_pipe(arg) {
    return { kind: 'pipe', value: toAst(arg) as PipeArg } satisfies FuncArg
  },
  FuncArg_expr(arg) {
    return { kind: 'expr', value: toAst(arg) as Expr } satisfies FuncArg
  },

  ContextRef(_dollar) {
    return { kind: 'context' } satisfies Bare<Source>
  },
  PositionalRef(_dollar, digits) {
    return {
      kind: 'positional_ref',
      index: parseInt(digits.sourceString, 10),
    } satisfies Bare<Source>
  },
  EachSelector(_dd, _l, body, _r, plus) {
    return {
      kind: 'each',
      selector: body.sourceString.trim(),
      requireOne: plus.children.length > 0,
    } satisfies Bare<Source>
  },
  SingleSelector(_d, _l, body, _r, omit) {
    return {
      kind: 'single',
      selector: body.sourceString.trim(),
      omit: omit.children.length > 0,
    } satisfies Bare<Source>
  },

  ChainStep(t) {
    return t.toAst()
  },

  PipeTransform_jsonata(_pipe, _name, _lp, body, _rp) {
    return {
      kind: 'pipe_transform',
      op: { name: 'jsonata', source: body.sourceString },
    } satisfies Bare<ChainStep>
  },
  PipeTransform_generic(_pipe, name, _lp, argList, _rp) {
    const args: PipeArg[] =
      _lp.children.length > 0
        ? argList.children[0]!.asIteration().children.map(
            (c) => toAst(c) as PipeArg,
          )
        : []
    return {
      kind: 'pipe_transform',
      op: { name: name.sourceString, args },
    } satisfies Bare<ChainStep>
  },
  PipeArg_kwarg(key, _colon, val) {
    return { key: key.sourceString, value: toAst(val) as string }
  },
  PipeArg_kwargInt(key, _colon, val) {
    return { key: key.sourceString, value: toAst(val) as number }
  },
  PipeArg_kwargExpr(key, _colon, chain) {
    return { key: key.sourceString, expr: toAst(chain) as Chain }
  },
  PipeArg_string(s) {
    return s.toAst() as string
  },
  PipeArg_integer(n) {
    return n.toAst() as number
  },
  PipeArg_ident(n) {
    return n.sourceString
  },

  ScopedExpr(_dotlp, expr, _rp) {
    return {
      kind: 'scoped_expr',
      expr: toAst(expr) as Expr,
    } satisfies Bare<ChainStep>
  },

  Block(_l, fields, _trailing, _r) {
    return {
      kind: 'block',
      fields: fields.asIteration().children.map((c) => toAst(c) as Field),
    } satisfies Bare<ChainStep>
  },

  Conditional_full(_q, then_, _colon, else_) {
    return {
      kind: 'conditional',
      then_: toAst(then_) as Expr,
      else_: toAst(else_) as Expr,
    } satisfies Bare<ChainStep>
  },
  Conditional_partial(_q, then_) {
    return {
      kind: 'conditional',
      then_: toAst(then_) as Expr,
      else_: null,
    } satisfies Bare<ChainStep>
  },

  Literal(e) {
    return e.toAst()
  },
  Literal_string(s) {
    return { kind: 'literal', value: s.toAst() as string } satisfies Bare<Expr>
  },
  Literal_number(n) {
    return {
      kind: 'literal',
      value: parseInt(n.sourceString, 10),
    } satisfies Bare<Expr>
  },
  Literal_null(_) {
    return { kind: 'literal', value: null } satisfies Bare<Expr>
  },
  Literal_true(_) {
    return { kind: 'literal', value: true } satisfies Bare<Expr>
  },
  Literal_false(_) {
    return { kind: 'literal', value: false } satisfies Bare<Expr>
  },

  stringLit(e) {
    return e.toAst()
  },
  stringLit_double(_l, chars, _r) {
    return chars.children.map((c) => c.toAst()).join('')
  },
  stringLit_single(_l, chars, _r) {
    return chars.children.map((c) => c.toAst()).join('')
  },

  doubleStringChar(e) {
    return e.toAst()
  },
  doubleStringChar_escaped(_bs, ch) {
    return ch.sourceString
  },
  doubleStringChar_other(ch) {
    return ch.sourceString
  },

  singleStringChar(e) {
    return e.toAst()
  },
  singleStringChar_escaped(_bs, ch) {
    return ch.sourceString
  },
  singleStringChar_other(ch) {
    return ch.sourceString
  },

  integer(_digits) {
    return parseInt(this.sourceString, 10)
  },
  number(_digits) {
    return parseInt(this.sourceString, 10)
  },

  _iter(...children) {
    return children.map((c) => toAst(c)) as unknown as AstResult
  },
  _terminal() {
    return this.sourceString
  },
}

type SpanCtx = { source: { startIdx: number; endIdx: number } }

function withSpan(
  fn: (...args: unknown[]) => AstResult,
): (...args: unknown[]) => AstResult {
  const stamp = function (this: SpanCtx, ...args: unknown[]) {
    const r = fn.apply(this, args)
    if (
      r !== null &&
      typeof r === 'object' &&
      !Array.isArray(r) &&
      !('span' in r)
    ) {
      ;(r as Record<string, unknown>).span = {
        start: this.source.startIdx,
        end: this.source.endIdx,
      }
    }
    return r
  }
  const arityWrappers: ((...args: unknown[]) => unknown)[] = [
    function (this: SpanCtx) {
      return stamp.apply(this, [])
    },
    function (this: SpanCtx, a0: unknown) {
      return stamp.apply(this, [a0])
    },
    function (this: SpanCtx, a0: unknown, a1: unknown) {
      return stamp.apply(this, [a0, a1])
    },
    function (this: SpanCtx, a0: unknown, a1: unknown, a2: unknown) {
      return stamp.apply(this, [a0, a1, a2])
    },
    function (
      this: SpanCtx,
      a0: unknown,
      a1: unknown,
      a2: unknown,
      a3: unknown,
    ) {
      return stamp.apply(this, [a0, a1, a2, a3])
    },
    function (
      this: SpanCtx,
      a0: unknown,
      a1: unknown,
      a2: unknown,
      a3: unknown,
      a4: unknown,
    ) {
      return stamp.apply(this, [a0, a1, a2, a3, a4])
    },
    function (
      this: SpanCtx,
      a0: unknown,
      a1: unknown,
      a2: unknown,
      a3: unknown,
      a4: unknown,
      a5: unknown,
    ) {
      return stamp.apply(this, [a0, a1, a2, a3, a4, a5])
    },
    function (
      this: SpanCtx,
      a0: unknown,
      a1: unknown,
      a2: unknown,
      a3: unknown,
      a4: unknown,
      a5: unknown,
      a6: unknown,
    ) {
      return stamp.apply(this, [a0, a1, a2, a3, a4, a5, a6])
    },
  ]
  return (arityWrappers[fn.length] ?? stamp) as (
    ...args: unknown[]
  ) => AstResult
}

function stampSpans(
  actions: HTMLegyActionDict<AstResult>,
): HTMLegyActionDict<AstResult> {
  const wrapped: Record<string, (...args: unknown[]) => AstResult> = {}
  for (const [name, fn] of Object.entries(actions)) {
    if (typeof fn !== 'function') {
      continue
    }
    wrapped[name] = withSpan(fn as (...args: unknown[]) => AstResult)
  }
  return wrapped as HTMLegyActionDict<AstResult>
}

semantics.addOperation<AstResult>('toAst', stampSpans(exprActions))

const COMMENT_RE = /\/\/[^\n]*/g

function scanComments(src: string): Comment[] {
  const out: Comment[] = []
  let inDouble = false
  let inSingle = false
  for (let i = 0; i < src.length; i++) {
    const ch = src[i]
    if (inDouble) {
      if (ch === '\\') {
        i++
      } else if (ch === '"') {
        inDouble = false
      }
      continue
    }
    if (inSingle) {
      if (ch === '\\') {
        i++
      } else if (ch === "'") {
        inSingle = false
      }
      continue
    }
    if (ch === '"') {
      inDouble = true
      continue
    }
    if (ch === "'") {
      inSingle = true
      continue
    }
    if (ch === '/' && src[i + 1] === '/') {
      COMMENT_RE.lastIndex = i
      const m = COMMENT_RE.exec(src)
      if (m) {
        out.push({ start: i, end: i + m[0].length, text: m[0] })
        i += m[0].length - 1
      }
    }
  }
  return out
}

type AnyNode = Spanned & Record<string, unknown>

function collectNodes(root: Expr): AnyNode[] {
  const nodes: AnyNode[] = []
  const visit = (value: unknown): void => {
    if (Array.isArray(value)) {
      for (const v of value) {
        visit(v)
      }
      return
    }
    if (value === null || typeof value !== 'object') {
      return
    }
    const obj = value as Record<string, unknown>
    if (
      typeof obj.span === 'object' &&
      obj.span !== null &&
      typeof (obj.span as Span).start === 'number'
    ) {
      nodes.push(obj as AnyNode)
    }
    for (const key of Object.keys(obj)) {
      if (key === 'span' || key === 'leading' || key === 'trailing') {
        continue
      }
      visit(obj[key])
    }
  }
  visit(root)
  return nodes
}

function lineStartIndex(src: string, offset: number): number {
  const nl = src.lastIndexOf('\n', offset - 1)
  return nl + 1
}

function bindComments(src: string, root: Expr, comments: Comment[]): void {
  if (comments.length === 0) {
    return
  }
  const nodes = collectNodes(root)

  for (const comment of comments) {
    const trailingHost = pickTrailingHost(src, nodes, comment)
    if (trailingHost) {
      ;(trailingHost.trailing ??= []).push(comment)
      continue
    }
    const leadingHost = pickLeadingHost(nodes, comment)
    if (leadingHost) {
      ;(leadingHost.leading ??= []).push(comment)
    } else {
      ;(root.leading ??= []).push(comment)
    }
  }
}

function pickTrailingHost(
  src: string,
  nodes: AnyNode[],
  comment: Comment,
): AnyNode | null {
  const commentLineStart = lineStartIndex(src, comment.start)
  let best: AnyNode | null = null
  for (const node of nodes) {
    const end = node.span.end
    if (end > comment.start) {
      continue
    }
    if (end < commentLineStart) {
      continue
    }
    const between = src.slice(end, comment.start).trim()
    if (between !== '' && !/^[,\])}]*$/.test(between)) {
      continue
    }
    if (!best || node.span.end > best.span.end) {
      best = node
    }
  }
  return best
}

function pickLeadingHost(nodes: AnyNode[], comment: Comment): AnyNode | null {
  let best: AnyNode | null = null
  for (const node of nodes) {
    if (node.span.start < comment.end) {
      continue
    }
    if (
      !best ||
      node.span.start < best.span.start ||
      (node.span.start === best.span.start && node.span.end < best.span.end)
    ) {
      best = node
    }
  }
  return best
}

export function parse(src: string): Expr {
  const match = grammar.match(src, 'Expr')
  if (match.failed()) {
    throw new Error(match.message ?? 'Parse failed')
  }
  const ast = semantics(match).toAst() as Expr
  bindComments(src, ast, scanComments(src))
  return ast
}
