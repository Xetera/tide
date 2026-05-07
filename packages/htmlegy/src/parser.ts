import * as ohm from 'ohm-js'
import type { NonterminalNode, IterationNode, TerminalNode } from 'ohm-js'
import type { HTMLegyActionDict, HTMLegySemantics } from './grammar.ohm-bundle'
import grammarSrc from './grammar.ohm?raw'

const grammar = ohm.grammar(
  grammarSrc,
) as unknown as import('./grammar.ohm-bundle').HTMLegyGrammar

export type SimplePipeline = { source: Source; tail: PipelineTail[] }

export type Expr =
  | { kind: 'array'; items: Expr[] }
  | { kind: 'object'; fields: Field[] }
  | { kind: 'match'; arms: MatchArm[] }
  | {
      kind: 'pipeline'
      primary: SimplePipeline
      fallback: SimplePipeline | null
    }
  | { kind: 'literal'; value: unknown }

export type Field =
  | { dynamic: false; key: string; value: Expr }
  | { dynamic: true; keyExpr: Expr; value: Expr }
  | { expr: true; value: Expr }

export type MatchArm =
  | { kind: 'each'; selector: string; body: Expr }
  | { kind: 'selector'; selector: string; body: Expr }
  | { kind: 'fallback'; body: Expr }

export type Source =
  | { kind: 'alias_ref'; name: string }
  | { kind: 'alias_each'; name: string; selector: string; requireOne: boolean }
  | { kind: 'alias_single'; name: string; selector: string; omit: boolean }
  | { kind: 'each'; selector: string; requireOne: boolean }
  | { kind: 'single'; selector: string; omit: boolean }
  | { kind: 'context' }
  | { kind: 'root_ref' }
  | { kind: 'watch'; inner: Source }
  | { kind: 'await'; condition: string | null; inner: Source }

export type PipelineTail =
  | { kind: 'colon_transform'; op: ColonOp }
  | { kind: 'pipe_transform'; op: PipeOp }
  | { kind: 'block'; fields: Field[] }
  | { kind: 'conditional'; then_: Expr; else_: Expr | null }
  | { kind: 'scoped_expr'; expr: Expr }

export type ColonOp =
  | { name: 'text' }
  | { name: 'attr'; arg: string }
  | { name: 'data'; arg: string }
  | { name: 'exists' }

export type PipeArg = string | number | { key: string; value: string | number }

export type PipeOp = { name: string; args: PipeArg[] }

type AstResult =
  | Expr
  | Field
  | MatchArm
  | Source
  | SimplePipeline
  | PipelineTail
  | PipeArg
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

  Array(_l, items, _r) {
    return {
      kind: 'array',
      items: items.asIteration().children.map((c) => toAst(c) as Expr),
    } satisfies Expr
  },

  Object(_l, fields, _r) {
    return {
      kind: 'object',
      fields: fields.asIteration().children.map((c) => toAst(c) as Field),
    } satisfies Expr
  },

  Field_static(key, _colon, value) {
    return {
      dynamic: false,
      key: toAst(key) as string,
      value: toAst(value) as Expr,
    } satisfies Field
  },
  Field_dynamic(_lb, keyExpr, _rb, _colon, value) {
    return {
      dynamic: true,
      keyExpr: toAst(keyExpr) as Expr,
      value: toAst(value) as Expr,
    } satisfies Field
  },
  Field_expr(_lp, pipeline, _rp) {
    return { expr: true, value: toAst(pipeline) as Expr } satisfies Field
  },

  Match(_kw, _l, arms, _r) {
    return {
      kind: 'match',
      arms: arms.children.map((c) => toAst(c) as MatchArm),
    } satisfies Expr
  },
  MatchArm_fallback(_ident, _arrow, body) {
    return { kind: 'fallback', body: toAst(body) as Expr } satisfies MatchArm
  },
  MatchArm_each(sel, _arrow, body) {
    const src = toAst(sel) as Source & { kind: 'each' }
    return {
      kind: 'each',
      selector: src.selector,
      body: toAst(body) as Expr,
    } satisfies MatchArm
  },
  MatchArm_selector(sel, _arrow, body) {
    const src = toAst(sel) as Source & { kind: 'single' }
    return {
      kind: 'selector',
      selector: src.selector,
      body: toAst(body) as Expr,
    } satisfies MatchArm
  },

  Pipeline(primary, _qq, fallback) {
    return {
      kind: 'pipeline',
      primary: toAst(primary) as unknown as SimplePipeline,
      fallback:
        fallback.children.length > 0
          ? (toAst(fallback.children[0]!) as unknown as SimplePipeline)
          : null,
    } satisfies Expr
  },

  SimplePipeline(source, tail) {
    return {
      source: toAst(source) as Source,
      tail: tail.children.map((c) => toAst(c) as PipelineTail),
    } satisfies SimplePipeline
  },

  Source_watch(_kw, inner) {
    return { kind: 'watch', inner: toAst(inner) as Source } satisfies Source
  },
  Source_awaitCond(_kw, _l, cond, _r, inner) {
    return {
      kind: 'await',
      condition: cond.sourceString.trim(),
      inner: toAst(inner) as Source,
    } satisfies Source
  },
  Source_awaitSelf(_kw, inner) {
    return {
      kind: 'await',
      condition: null,
      inner: toAst(inner) as Source,
    } satisfies Source
  },

  Source_aliasEach(_at, name, sel) {
    const s = toAst(sel) as Source & { kind: 'each' }
    return {
      kind: 'alias_each',
      name: name.sourceString,
      selector: s.selector,
      requireOne: s.requireOne,
    } satisfies Source
  },
  Source_aliasSingle(_at, name, sel) {
    const s = toAst(sel) as Source & { kind: 'single' }
    return {
      kind: 'alias_single',
      name: name.sourceString,
      selector: s.selector,
      omit: s.omit,
    } satisfies Source
  },
  Source_aliasRef(_at, name) {
    return { kind: 'alias_ref', name: name.sourceString } satisfies Source
  },
  Source_rootRef(_at) {
    return { kind: 'root_ref' } satisfies Source
  },

  ContextRef(_dollar) {
    return { kind: 'context' } satisfies Source
  },
  EachSelector(_dd, _l, body, _r, plus) {
    return {
      kind: 'each',
      selector: body.sourceString.trim(),
      requireOne: plus.children.length > 0,
    } satisfies Source
  },
  SingleSelector(_d, _l, body, _r, omit) {
    return {
      kind: 'single',
      selector: body.sourceString.trim(),
      omit: omit.children.length > 0,
    } satisfies Source
  },

  PipelineTail(t) {
    return t.toAst()
  },

  ColonTransform_text(_colon, _kw) {
    return {
      kind: 'colon_transform',
      op: { name: 'text' },
    } satisfies PipelineTail
  },
  ColonTransform_attr(_colon, _kw, _l, arg, _r) {
    return {
      kind: 'colon_transform',
      op: { name: 'attr', arg: arg.sourceString },
    } satisfies PipelineTail
  },
  ColonTransform_data(_colon, _kw, _l, arg, _r) {
    return {
      kind: 'colon_transform',
      op: { name: 'data', arg: arg.sourceString },
    } satisfies PipelineTail
  },
  ColonTransform_exists(_colon, _kw) {
    return {
      kind: 'colon_transform',
      op: { name: 'exists' },
    } satisfies PipelineTail
  },

  PipeTransform(_pipe, name, _lp, argList, _rp) {
    const args: PipeArg[] =
      _lp.children.length > 0
        ? argList.children[0]!.asIteration().children.map(
            (c) => toAst(c) as PipeArg,
          )
        : []
    return {
      kind: 'pipe_transform',
      op: { name: name.sourceString, args },
    } satisfies PipelineTail
  },
  PipeArg_kwarg(key, _colon, val) {
    return { key: key.sourceString, value: toAst(val) as string }
  },
  PipeArg_kwargInt(key, _colon, val) {
    return { key: key.sourceString, value: toAst(val) as number }
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
    } satisfies PipelineTail
  },

  Block(_l, fields, _r) {
    return {
      kind: 'block',
      fields: fields.asIteration().children.map((c) => toAst(c) as Field),
    } satisfies PipelineTail
  },

  Conditional_full(_q, then_, _colon, else_) {
    return {
      kind: 'conditional',
      then_: toAst(then_) as Expr,
      else_: toAst(else_) as Expr,
    } satisfies PipelineTail
  },
  Conditional_partial(_q, then_) {
    return {
      kind: 'conditional',
      then_: toAst(then_) as Expr,
      else_: null,
    } satisfies PipelineTail
  },

  Literal(e) {
    return e.toAst()
  },
  Literal_string(s) {
    return { kind: 'literal', value: s.toAst() as string } satisfies Expr
  },
  Literal_number(n) {
    return {
      kind: 'literal',
      value: parseInt(n.sourceString, 10),
    } satisfies Expr
  },
  Literal_null(_) {
    return { kind: 'literal', value: null } satisfies Expr
  },
  Literal_true(_) {
    return { kind: 'literal', value: true } satisfies Expr
  },
  Literal_false(_) {
    return { kind: 'literal', value: false } satisfies Expr
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

semantics.addOperation<AstResult>('toAst', exprActions)

export function parse(src: string): Expr {
  const match = grammar.match(src, 'Expr')
  if (match.failed()) {
    throw new Error(match.message ?? 'Parse failed')
  }
  return semantics(match).toAst() as Expr
}
