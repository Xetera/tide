import { parse } from './parser'
import { expandLocaleSuffix, parseLocaleNumber } from './number-parser'
import type {
  Expr,
  Field,
  MatchArm,
  Source,
  SimplePipeline,
  PipelineTail,
  ColonOp,
  PipeOp,
  PipeArg,
} from './parser'
import type { HtmlegyProvider } from './provider'

type Env<N> = Map<string, N>

const OMIT = Symbol('omit')

type SelectorErrorContext = {
  selector: string
  kind: 'single' | 'each'
  field: string
  ctxTag: string
  ctxHtml: string
}

class SelectorError extends Error {
  context: SelectorErrorContext

  constructor(ctx: SelectorErrorContext) {
    const kind = ctx.kind === 'each' ? '$$' : '$'
    const lines = [
      `${kind}(${ctx.selector}) matched nothing`,
      `  field:   ${ctx.field || '(unknown)'}`,
      `  context: <${ctx.ctxTag}>`,
      `  html:    ${ctx.ctxHtml}`,
    ]
    super(lines.join('\n'))
    this.name = 'SelectorError'
    this.context = ctx
  }
}

export type HighlightLabel = {
  field: string[]
}

export type HtmlegyOptions<N> = {
  locale?: string
  onElement?: (node: N, label: HighlightLabel, isArrayItem: boolean) => void
}

export type ReactiveExpr = {
  get(): unknown
  subscribe(cb: (value: unknown) => void): () => void
}

type EvalContext = {
  label: string[]
}

function hasReactiveSource(src: Source): boolean {
  return src.kind === 'watch' || src.kind === 'await'
}

function isReactive(expr: Expr): expr is Expr & { kind: 'pipeline' } {
  if (expr.kind !== 'pipeline') {
    return false
  }
  return hasReactiveSource(expr.primary.source)
}

function unwrapSource(src: Source): Source {
  switch (src.kind) {
    case 'watch':
    case 'await':
      return unwrapSource(src.inner)
    default:
      return src
  }
}

function selectorForSource(src: Source): string | null {
  if (src.kind === 'each' || src.kind === 'single') {
    return src.selector
  }
  if (src.kind === 'alias_each' || src.kind === 'alias_single') {
    return src.selector
  }
  if (src.kind === 'watch' || src.kind === 'await') {
    return selectorForSource(src.inner)
  }
  return null
}

class Evaluator<N> {
  readonly #provider: HtmlegyProvider<N>
  readonly #locale: string
  readonly #onElement: HtmlegyOptions<N>['onElement']

  constructor(
    provider: HtmlegyProvider<N>,
    locale: string,
    onElement: HtmlegyOptions<N>['onElement'],
  ) {
    this.#provider = provider
    this.#locale = locale
    this.#onElement = onElement
  }

  evalExpr(expr: Expr, el: N, env: Env<N>, ctx: EvalContext): unknown {
    switch (expr.kind) {
      case 'literal':
        return expr.value
      case 'array': {
        const result: unknown[] = []
        for (const item of expr.items) {
          const value = this.evalExpr(item, el, env, ctx)
          if (Array.isArray(value)) {
            result.push(...value)
          } else {
            result.push(value)
          }
        }
        return result
      }
      case 'object':
        return this.evalFields(expr.fields, el, env, ctx)
      case 'match':
        return this.evalMatch(expr.arms, el, env, ctx)
      case 'pipeline': {
        let primary: unknown
        try {
          primary = this.evalPipelineTail(expr.primary, el, env, ctx)
        } catch (e) {
          if (e instanceof SelectorError && expr.fallback) {
            return this.evalPipelineTail(expr.fallback, el, env, ctx)
          }
          throw e
        }
        if ((primary == null || primary === OMIT) && expr.fallback) {
          return this.evalPipelineTail(expr.fallback, el, env, ctx)
        }
        return primary
      }
    }
  }

  evalPipelineTail(
    expr: SimplePipeline,
    root: N,
    env: Env<N>,
    ctx: EvalContext,
  ): unknown {
    const unwrapped = unwrapSource(expr.source)
    return this.evalPipeline(
      { source: unwrapped, tail: expr.tail },
      root,
      env,
      ctx,
    )
  }

  private evalFields(
    fields: Field[],
    el: N,
    env: Env<N>,
    ctx: EvalContext,
  ): Record<string, unknown> {
    const result: Record<string, unknown> = {}
    for (const field of fields) {
      if ('expr' in field) {
        const value = this.evalExpr(field.value, el, env, ctx)
        if (value !== null && value !== OMIT && typeof value === 'object') {
          Object.assign(result, value)
        }
      } else if (field.dynamic) {
        const key = this.evalExpr(field.keyExpr, el, env, ctx)
        const value = this.evalExpr(field.value, el, env, ctx)
        if (typeof key === 'string') {
          result[key] = value
        }
      } else {
        const value = this.evalExpr(field.value, el, env, {
          label: [...ctx.label, field.key],
        })
        if (value !== OMIT) {
          result[field.key] = value
        }
      }
    }
    return result
  }

  private evalMatch(
    arms: MatchArm[],
    el: N,
    env: Env<N>,
    ctx: EvalContext,
  ): unknown {
    for (const arm of arms) {
      if (arm.kind === 'fallback') {
        return this.evalExpr(arm.body, el, env, ctx)
      }
      if (arm.kind === 'each') {
        const els = this.#provider.querySelectorAll(el, arm.selector)
        if (els.length === 0) {
          continue
        }
        return els.map((child) => this.evalExpr(arm.body, child, env, ctx))
      }
      const child = this.#provider.querySelector(el, arm.selector)
      if (child) {
        return this.evalExpr(arm.body, child, env, ctx)
      }
    }
    return undefined
  }

  private evalPipeline(
    expr: { source: Source; tail: PipelineTail[] },
    el: N,
    env: Env<N>,
    ctx: EvalContext,
  ): unknown {
    let current: unknown
    let omitOnNull = false
    let requiredSelector: string | null = null
    let requiredCtx = ctx
    let currentEnv = env

    switch (expr.source.kind) {
      case 'context':
        current = el
        break
      case 'root_ref':
        current = currentEnv.get('') ?? null
        break
      case 'alias_ref':
        current = currentEnv.get(expr.source.name) ?? null
        break
      case 'single': {
        const found =
          this.#provider.querySelector(el, expr.source.selector) ?? null
        if (found && this.#onElement) {
          this.#onElement(found, { field: ctx.label }, false)
        }
        current = found
        omitOnNull = expr.source.omit
        if (!expr.source.omit) {
          requiredSelector = expr.source.selector
          requiredCtx = ctx
        }
        break
      }
      case 'each': {
        const els = this.#provider.querySelectorAll(el, expr.source.selector)
        if (expr.source.requireOne && els.length === 0) {
          throw new SelectorError({
            selector: expr.source.selector,
            kind: 'each',
            field: ctx.label.at(-1) ?? '',
            ctxTag: this.#provider.getTagName(el),
            ctxHtml: this.#provider.getContextHtml(el),
          })
        }
        current = els
        break
      }
      case 'alias_each': {
        currentEnv = new Map(env)
        currentEnv.set(expr.source.name, el)
        const els = this.#provider.querySelectorAll(el, expr.source.selector)
        if (expr.source.requireOne && els.length === 0) {
          throw new SelectorError({
            selector: expr.source.selector,
            kind: 'each',
            field: ctx.label.at(-1) ?? '',
            ctxTag: this.#provider.getTagName(el),
            ctxHtml: this.#provider.getContextHtml(el),
          })
        }
        current = els
        break
      }
      case 'alias_single': {
        currentEnv = new Map(env)
        currentEnv.set(expr.source.name, el)
        const found =
          this.#provider.querySelector(el, expr.source.selector) ?? null
        if (found && this.#onElement) {
          this.#onElement(found, { field: ctx.label }, false)
        }
        current = found
        omitOnNull = expr.source.omit
        if (!expr.source.omit) {
          requiredSelector = expr.source.selector
        }
        break
      }
    }

    for (const step of expr.tail) {
      switch (step.kind) {
        case 'colon_transform':
          if (current == null && omitOnNull) {
            return OMIT
          }
          current = this.applyColonOp(step.op, current)
          break

        case 'pipe_transform':
          if (current == null && omitOnNull) {
            return OMIT
          }
          current = this.applyPipeOp(step.op, current)
          break

        case 'block': {
          const isEach =
            expr.source.kind === 'each' || expr.source.kind === 'alias_each'
          if (isEach) {
            const aliasName =
              expr.source.kind === 'alias_each' ? expr.source.name : null
            current = (current as N[]).map((child) => {
              const iterEnv = aliasName
                ? new Map([...currentEnv, [aliasName, child]])
                : currentEnv
              return this.evalFields(step.fields, child, iterEnv, {
                label: ctx.label,
              })
            })
          } else {
            if (current == null) {
              return omitOnNull ? OMIT : null
            }
            current = this.evalFields(
              step.fields,
              current as N,
              currentEnv,
              ctx,
            )
          }
          break
        }

        case 'conditional': {
          const truthy = current != null && current !== false && current !== ''
          if (truthy) {
            return this.evalExpr(step.then_, el, currentEnv, ctx)
          }
          if (step.else_) {
            return this.evalExpr(step.else_, el, currentEnv, ctx)
          }
          return OMIT
        }

        case 'scoped_expr':
          if (current == null) {
            return omitOnNull ? OMIT : null
          }
          return this.evalExpr(step.expr, current as N, currentEnv, ctx)
      }
    }

    if (current == null) {
      if (omitOnNull) {
        return OMIT
      }
      if (requiredSelector !== null) {
        throw new SelectorError({
          selector: requiredSelector,
          kind: 'single',
          field: requiredCtx.label.at(-1) ?? '',
          ctxTag: this.#provider.getTagName(el),
          ctxHtml: this.#provider.getContextHtml(el),
        })
      }
    }
    return current
  }

  private applyColonOp(op: ColonOp, value: unknown): unknown {
    switch (op.name) {
      case 'text':
        return value != null ? this.#provider.getText(value as N) : null
      case 'attr':
        return value != null
          ? this.#provider.getAttribute(value as N, op.arg)
          : null
      case 'data':
        return value != null
          ? this.#provider.getAttribute(value as N, `data-${op.arg}`)
          : null
      case 'exists':
        return value != null
    }
  }

  private applyPipeOp(op: PipeOp, value: unknown): unknown {
    const { name, args } = op

    switch (name) {
      case 'number': {
        if (value == null) {
          return null
        }
        const kwLocale = args.find(
          (a): a is Extract<PipeArg, object> =>
            typeof a === 'object' &&
            (a as Extract<PipeArg, object>).key === 'locale',
        )
        return parseLocaleNumber(
          String(value),
          kwLocale ? String(kwLocale.value) : this.#locale,
        )
      }
      case 'url':
        return value ? this.#provider.resolveUrl(String(value)) : null
      case 'expandSuffix':
        return value != null
          ? expandLocaleSuffix(String(value), this.#locale)
          : null
      case 'regex': {
        if (value == null) {
          return null
        }
        const pattern = args[0] as string
        const group = args[1] as number | undefined
        const m = String(value).match(new RegExp(pattern))
        if (!m) {
          return null
        }
        return group != null ? (m[group] ?? null) : m[0]
      }
      case 'trim': {
        if (value == null) {
          return null
        }
        let s = String(value)
        if (args.length === 0 || args.includes('outside')) {
          s = s.trim()
        }
        if (args.length === 0 || args.includes('inside')) {
          s = s.replace(/\s+/g, ' ')
        }
        return s
      }
      case 'lowercase':
        return value == null ? null : String(value).toLowerCase()
      case 'date': {
        if (value == null) {
          return null
        }
        const d = new Date(String(value))
        return isNaN(d.getTime()) ? null : d
      }
      case 'merge':
        return Array.isArray(value) ? Object.assign({}, ...value) : value
      default: {
        const providerOp = this.#provider.pipeOps[name]
        if (providerOp) {
          return providerOp(value as N, args, this.#locale)
        }
        throw new Error(`unknown pipe function: ${name}`)
      }
    }
  }

  setupReactiveSource(
    src: Source,
    root: N,
    onValue: (node: N) => void,
  ): () => void {
    if (src.kind === 'watch') {
      const selector = selectorForSource(src.inner)
      const run = () => onValue(root)
      run()
      return this.#provider.watch(root, selector, run)
    }

    if (src.kind === 'await') {
      const condition = src.condition ?? selectorForSource(src.inner)
      return this.#provider.await(root, condition, (node) => {
        this.setupReactiveSource(src.inner, node, onValue)
      })
    }

    onValue(root)
    return () => {}
  }
}

export class HtmlegyExpr<N> {
  readonly #ast: Expr
  readonly #evaluator: Evaluator<N>
  readonly #reactive: boolean

  constructor(
    src: string,
    provider: HtmlegyProvider<N>,
    options: HtmlegyOptions<N> = {},
  ) {
    this.#ast = parse(src)
    this.#evaluator = new Evaluator(
      provider,
      options.locale ?? 'en',
      options.onElement,
    )
    this.#reactive = isReactive(this.#ast)
  }

  run(root: N): unknown {
    return this.#evaluator.evalExpr(this.#ast, root, new Map([['', root]]), {
      label: [],
    })
  }

  reactive(root: N): ReactiveExpr {
    if (!this.#reactive) {
      throw new Error(
        'expression does not contain a reactive source (watch/await)',
      )
    }
    return buildReactive(
      this.#ast as Expr & { kind: 'pipeline' },
      root,
      this.#evaluator,
    )
  }

  get isReactive(): boolean {
    return this.#reactive
  }
}

function buildReactive<N>(
  expr: Expr & { kind: 'pipeline' },
  root: N,
  ev: Evaluator<N>,
): ReactiveExpr {
  const subscribers = new Set<(value: unknown) => void>()
  let currentValue: unknown
  let started = false
  let dispose: (() => void) | null = null

  const env: Env<N> = new Map([['', root]])
  const ctx: EvalContext = { label: [] }

  function emit(v: unknown) {
    currentValue = v
    for (const cb of subscribers) {
      cb(v)
    }
  }

  function start() {
    if (started) {
      return
    }
    started = true
    dispose = ev.setupReactiveSource(expr.primary.source, root, (el) => {
      const result = ev.evalPipelineTail(expr.primary, el, env, ctx)
      emit(result)
    })
  }

  return {
    get() {
      return currentValue
    },
    subscribe(cb) {
      subscribers.add(cb)
      start()
      return () => {
        subscribers.delete(cb)
        if (subscribers.size === 0) {
          dispose?.()
          started = false
        }
      }
    },
  }
}
