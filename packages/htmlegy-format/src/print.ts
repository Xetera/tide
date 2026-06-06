import type {
  Chain,
  ChainStep,
  Comment,
  Expr,
  ExprMatchArm,
  Field,
  MatchArm,
  PipeArg,
  PipeOp,
  Source,
  Spanned,
} from '@tide/htmlegy'
import {
  type Doc,
  breakParent,
  concat,
  dedent,
  group,
  hardline,
  indent,
  join,
  line,
  softline,
  text,
} from './doc'

function leading(node: Spanned): Doc {
  const comments = node.leading
  if (!comments || comments.length === 0) return concat([])
  return concat(comments.map((c) => concat([text(c.text), hardline])))
}

function trailing(node: Spanned): Doc {
  const comments = node.trailing
  if (!comments || comments.length === 0) return concat([])
  return concat(
    comments.map((c) => concat([text(' '), text(c.text), breakParent])),
  )
}

function withTrivia(node: Spanned, doc: Doc): Doc {
  return concat([leading(node), doc, trailing(node)])
}

function printSeq(
  nodes: Spanned[],
  printBody: (node: Spanned, index: number) => Doc,
  separator: Doc,
): Doc {
  return concat(
    nodes.map((node, i) => {
      const last = i === nodes.length - 1
      return concat([
        leading(node),
        printBody(node, i),
        last ? concat([]) : separator,
        trailing(node),
        last ? concat([]) : line,
      ])
    }),
  )
}

function quote(value: string): string {
  const escaped = value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')
  return `"${escaped}"`
}

function printLiteral(value: unknown): Doc {
  if (value === null) return text('null')
  if (typeof value === 'boolean') return text(value ? 'true' : 'false')
  if (typeof value === 'number') return text(String(value))
  if (typeof value === 'string') return text(quote(value))
  return text(String(value))
}

function printPipeArg(arg: PipeArg): Doc {
  if (typeof arg === 'string') return text(quote(arg))
  if (typeof arg === 'number') return text(String(arg))
  if ('expr' in arg) {
    return concat([text(arg.key), text(': '), printChain(arg.expr)])
  }
  const value =
    typeof arg.value === 'number' ? text(String(arg.value)) : text(quote(arg.value))
  return concat([text(arg.key), text(': '), value])
}

function printArgs(args: PipeArg[]): Doc {
  if (args.length === 0) return concat([])
  return concat([text('('), join(text(', '), args.map(printPipeArg)), text(')')])
}

function printPipeOp(op: PipeOp): Doc {
  if ('source' in op) {
    return concat([text('| jsonata('), text(op.source), text(')')])
  }
  return concat([text('| '), text(op.name), printArgs(op.args)])
}

function printSource(source: Source): Doc {
  switch (source.kind) {
    case 'literal':
      return printLiteral(source.value)
    case 'context':
      return text('$')
    case 'root_ref':
      return text('@')
    case 'positional_ref':
      return text(`$${source.index}`)
    case 'alias_ref':
      return text(`@${source.name}`)
    case 'single':
      return text(`$(${source.selector})${source.omit ? '?' : ''}`)
    case 'each':
      return text(`$$(${source.selector})${source.requireOne ? '+' : ''}`)
    case 'root_single':
      return text(`@$(${source.selector})${source.omit ? '?' : ''}`)
    case 'root_each':
      return text(`@$$(${source.selector})${source.requireOne ? '+' : ''}`)
    case 'alias_single':
      return text(`@${source.name}$(${source.selector})${source.omit ? '?' : ''}`)
    case 'alias_each':
      return text(
        `@${source.name}$$(${source.selector})${source.requireOne ? '+' : ''}`,
      )
    case 'watch':
      return concat([text('watch '), printSource(source.inner)])
    case 'await':
      return concat([
        source.condition !== null
          ? text(`await(${source.condition}) `)
          : text('await '),
        printSource(source.inner),
      ])
    case 'func_call':
      return printFuncCall(source)
  }
}

function printFuncCall(
  source: Source & { kind: 'func_call' },
): Doc {
  const args: Doc[] = [printExpr(source.expr)]
  for (const e of source.exprArgs) args.push(printExpr(e))
  for (const a of source.args) args.push(printPipeArg(a))
  return concat([text(source.name), text('('), join(text(', '), args), text(')')])
}

function printChainStep(step: ChainStep): Doc {
  switch (step.kind) {
    case 'pipe_transform':
      return printPipeOp(step.op)
    case 'scoped_expr':
      return concat([text('.('), printExpr(step.expr), text(')')])
    case 'block':
      return concat([text(' '), printObjectLike(step.fields)])
    case 'conditional':
      if (step.else_ === null) {
        return concat([text(' ? '), printExpr(step.then_)])
      }
      return concat([
        text(' ? '),
        printExpr(step.then_),
        text(' : '),
        printExpr(step.else_),
      ])
  }
}

function printChain(chain: Chain): Doc {
  const head = printSource(chain.source)
  if (chain.tail.length === 0) return head
  const pipes = chain.tail.map((step) =>
    step.kind === 'pipe_transform'
      ? concat([line, printChainStep(step)])
      : step.kind === 'block'
        ? dedent(printChainStep(step))
        : printChainStep(step),
  )
  return group(concat([head, indent(concat(pipes))]))
}

function printObjectLike(fields: Field[]): Doc {
  if (fields.length === 0) return text('{}')
  return group(
    concat([
      text('{'),
      indent(
        concat([
          line,
          printSeq(fields, (f) => printFieldBody(f as Field), text(',')),
        ]),
      ),
      line,
      text('}'),
    ]),
  )
}

function printFieldBody(field: Field): Doc {
  if ('expr' in field) {
    return concat([text('('), printExpr(field.value), text(')')])
  }
  if (field.dynamic) {
    return concat([
      text('['),
      printExpr(field.keyExpr),
      text(']: '),
      printExpr(field.value),
    ])
  }
  return concat([text(quote(field.key)), text(': '), printExpr(field.value)])
}

function printArray(items: Expr[]): Doc {
  if (items.length === 0) return text('[]')
  return group(
    concat([
      text('['),
      indent(
        concat([
          softline,
          printSeq(items, (e) => printExprBody(e as Expr), text(',')),
        ]),
      ),
      softline,
      text(']'),
    ]),
  )
}

function printMatchArmBody(arm: MatchArm): Doc {
  let head: Doc
  switch (arm.kind) {
    case 'each':
      head = text(`$$(${arm.selector})`)
      break
    case 'selector':
      head = text(`$(${arm.selector})`)
      break
    case 'call':
      head = concat([
        text(arm.name),
        text('('),
        join(text(', '), [printExpr(arm.expr), ...arm.args.map(printPipeArg)]),
        text(')'),
      ])
      break
    case 'fallback':
      head = text('_')
      break
  }
  return concat([head, text(' => '), printExpr(arm.body)])
}

function printExprMatchArmBody(arm: ExprMatchArm): Doc {
  let head: Doc
  switch (arm.kind) {
    case 'literal':
      head = printLiteral(arm.value)
      break
    case 'fallback':
      head = text('_')
      break
    case 'pipe':
      head = join(text(' '), arm.ops.map(printPipeOp))
      break
  }
  return concat([head, text(' => '), printExpr(arm.body)])
}

function printMatch(node: Expr & { kind: 'match' }): Doc {
  const header = node.source !== null ? `match $(${node.source}) ` : 'match '
  if (node.arms.length === 0) return text(`${header}{}`)
  return concat([
    text(header),
    text('{'),
    indent(
      concat([
        hardline,
        printSeq(
          node.arms,
          (a) => printMatchArmBody(a as MatchArm),
          concat([]),
        ),
      ]),
    ),
    hardline,
    text('}'),
  ])
}

function printMatchExpr(node: Expr & { kind: 'match_expr' }): Doc {
  if (node.arms.length === 0) {
    return concat([text('match '), printExpr(node.scrutinee), text(' {}')])
  }
  return concat([
    text('match '),
    printExpr(node.scrutinee),
    text(' {'),
    indent(
      concat([
        hardline,
        printSeq(
          node.arms,
          (a) => printExprMatchArmBody(a as ExprMatchArm),
          text(','),
        ),
      ]),
    ),
    hardline,
    text('}'),
  ])
}

function printExpr(expr: Expr): Doc {
  const body = printExprBody(expr)
  return withTrivia(expr, body)
}

function printExprBody(expr: Expr): Doc {
  switch (expr.kind) {
    case 'literal':
      return printLiteral(expr.value)
    case 'array':
      return printArray(expr.items)
    case 'object':
      return printObjectLike(expr.fields)
    case 'match':
      return printMatch(expr)
    case 'match_expr':
      return printMatchExpr(expr)
    case 'fallback_expr':
      if (expr.fallback === null) return printChain(expr.primary)
      return group(
        concat([
          printChain(expr.primary),
          indent(concat([line, text('?? '), printChain(expr.fallback)])),
        ]),
      )
  }
}

export function printAst(expr: Expr): Doc {
  return printExpr(expr)
}

export type { Comment }
