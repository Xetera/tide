import * as ohm from 'ohm-js'
import grammarSrc from './grammar.ohm?raw'

const grammar = ohm.grammar(grammarSrc)

export type Expr =
  | { kind: 'array'; items: Expr[] }
  | { kind: 'object'; fields: Field[] }
  | { kind: 'match'; arms: MatchArm[] }
  | { kind: 'pipeline'; source: Source; tail: PipelineTail[] }
  | { kind: 'literal'; value: unknown }

export type Field =
  | { dynamic: false; key: string; value: Expr }
  | { dynamic: true; keyExpr: Expr; value: Expr }
  | { expr: true; value: Expr }

export type MatchArm =
  | { kind: 'selector'; selector: string; body: Expr }
  | { kind: 'fallback'; body: Expr }

export type Source =
  | { kind: 'alias_ref'; name: string }
  | { kind: 'alias_each'; name: string; selector: string }
  | { kind: 'alias_single'; name: string; selector: string; omit: boolean }
  | { kind: 'each'; selector: string }
  | { kind: 'single'; selector: string; omit: boolean }
  | { kind: 'context' }
  | { kind: 'root_ref' }
  | { kind: 'watch'; inner: Source }
  | { kind: 'await'; condition: string | null; inner: Source }

export type PipelineTail =
  | { kind: 'colon_transform'; op: ColonOp }
  | { kind: 'pipe_transform'; op: PipeOp }
  | { kind: 'fallback_selector'; selector: string }
  | { kind: 'block'; fields: Field[] }
  | { kind: 'conditional'; then: Expr; else_: Expr | null }
  | { kind: 'scoped_expr'; expr: Expr }

export type ColonOp =
  | { name: 'text' }
  | { name: 'attr'; arg: string }
  | { name: 'data'; arg: string }
  | { name: 'exists' }

export type PipeArg = string | number | { key: string; value: string | number }

export type PipeOp = { name: string; args: PipeArg[] }

type AstNode =
  | Expr
  | Field
  | MatchArm
  | Source
  | PipelineTail
  | string
  | number
  | string[]

interface NodWithAst extends ohm.Node {
  toAst(): AstNode
}

function ast<T extends AstNode>(node: ohm.Node): T {
  return (node as NodWithAst).toAst() as T
}

function astChildren<T extends AstNode>(nodes: ohm.Node[]): T[] {
  return nodes.map((n) => ast<T>(n))
}

const semantics = grammar.createSemantics()

semantics.addOperation<AstNode>('toAst', {
  Expr(e) {
    return ast(e)
  },

  Array(_l, items, _r) {
    return { kind: 'array', items: astChildren<Expr>(items.asIteration().children) } satisfies Expr
  },

  Object(_l, fields, _r) {
    return {
      kind: 'object',
      fields: astChildren<Field>(fields.asIteration().children),
    } satisfies Expr
  },

  Field_static(key, _colon, value) {
    return {
      dynamic: false,
      key: ast<string>(key),
      value: ast<Expr>(value),
    } satisfies Field
  },
  Field_dynamic(_lb, keyExpr, _rb, _colon, value) {
    return {
      dynamic: true,
      keyExpr: ast<Expr>(keyExpr),
      value: ast<Expr>(value),
    } satisfies Field
  },
  Field_expr(_lp, pipeline, _rp) {
    return { expr: true, value: ast<Expr>(pipeline) } satisfies Field
  },

  Match(_kw, _l, arms, _r) {
    return {
      kind: 'match',
      arms: astChildren<MatchArm>(arms.children),
    } satisfies Expr
  },
  MatchArm_fallback(_ident, _arrow, body) {
    return { kind: 'fallback', body: ast<Expr>(body) } satisfies MatchArm
  },
  MatchArm_selector(sel, _arrow, body) {
    const src = ast<Source>(sel) as Source & { kind: 'single' }
    return {
      kind: 'selector',
      selector: src.selector,
      body: ast<Expr>(body),
    } satisfies MatchArm
  },

  Pipeline(source, tail) {
    return {
      kind: 'pipeline',
      source: ast<Source>(source),
      tail: astChildren<PipelineTail>(tail.children),
    } satisfies Expr
  },

  Source_watch(_kw, inner) {
    return { kind: 'watch', inner: ast<Source>(inner) } satisfies Source
  },
  Source_awaitCond(_kw, _l, cond, _r, inner) {
    return {
      kind: 'await',
      condition: cond.sourceString.trim(),
      inner: ast<Source>(inner),
    } satisfies Source
  },
  Source_awaitSelf(_kw, inner) {
    return {
      kind: 'await',
      condition: null,
      inner: ast<Source>(inner),
    } satisfies Source
  },

  Source_aliasEach(_at, name, sel) {
    const s = ast<Source>(sel) as Source & { kind: 'each' }
    return {
      kind: 'alias_each',
      name: name.sourceString,
      selector: s.selector,
    } satisfies Source
  },
  Source_aliasSingle(_at, name, sel) {
    const s = ast<Source>(sel) as Source & { kind: 'single' }
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
  EachSelector(_dd, _l, body, _r) {
    return { kind: 'each', selector: body.sourceString.trim() } satisfies Source
  },
  SingleSelector(_d, _l, body, _r, omit) {
    return {
      kind: 'single',
      selector: body.sourceString.trim(),
      omit: omit.children.length > 0,
    } satisfies Source
  },

  PipelineTail(t) {
    return ast(t)
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
        ? astChildren<PipeArg>(argList.children[0].asIteration().children)
        : []
    return {
      kind: 'pipe_transform',
      op: { name: name.sourceString, args },
    } satisfies PipelineTail
  },
  PipeArg_kwarg(key, _colon, val) {
    return { key: key.sourceString, value: ast<string>(val) }
  },
  PipeArg_kwargInt(key, _colon, val) {
    return { key: key.sourceString, value: ast<number>(val) }
  },
  PipeArg_string(s) {
    return ast<string>(s)
  },
  PipeArg_integer(n) {
    return ast<number>(n)
  },
  PipeArg_ident(n) {
    return n.sourceString
  },

  ScopedExpr(_dotlp, expr, _rp) {
    return { kind: 'scoped_expr', expr: ast<Expr>(expr) } satisfies PipelineTail
  },

  FallbackSelector(_qq, _d, _l, body, _r) {
    return {
      kind: 'fallback_selector',
      selector: body.sourceString.trim(),
    } satisfies PipelineTail
  },

  Block(_l, fields, _r) {
    return {
      kind: 'block',
      fields: astChildren<Field>(fields.asIteration().children),
    } satisfies PipelineTail
  },

  Conditional_full(_q, then_, _colon, else_) {
    return {
      kind: 'conditional',
      then: ast<Expr>(then_),
      else_: ast<Expr>(else_),
    } satisfies PipelineTail
  },
  Conditional_partial(_q, then_) {
    return {
      kind: 'conditional',
      then: ast<Expr>(then_),
      else_: null,
    } satisfies PipelineTail
  },

  Literal(e) {
    return ast(e)
  },
  Literal_string(s) {
    return { kind: 'literal', value: ast<string>(s) } satisfies Expr
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
    return ast(e)
  },
  stringLit_double(_l, chars, _r) {
    return chars.children.map((c) => (c as NodWithAst).toAst()).join('')
  },
  stringLit_single(_l, chars, _r) {
    return chars.children.map((c) => (c as NodWithAst).toAst()).join('')
  },

  doubleStringChar(e) {
    return ast(e)
  },
  doubleStringChar_escaped(_bs, ch) {
    return ch.sourceString
  },
  doubleStringChar_other(ch) {
    return ch.sourceString
  },

  singleStringChar(e) {
    return ast(e)
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
    return children.map((c) => (c as NodWithAst).toAst()) as AstNode[]
  },
  _terminal() {
    return this.sourceString
  },
})

export function parse(src: string): Expr {
  const match = grammar.match(src)
  if (match.failed()) {
    throw new Error(match.message ?? 'Parse failed')
  }
  return ast<Expr>(semantics(match))
}
