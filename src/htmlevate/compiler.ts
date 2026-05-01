import { parse } from './parser'
import type {
  Expr,
  Field,
  MatchArm,
  Source,
  PipelineTail,
  ColonOp,
  PipeOp,
  PipeArg,
} from './parser'

type Env = Map<string, Element>

const OMIT = Symbol('omit')

export type CompileOptions = {
  locale?: string
  onElement?: (element: Element, label: string, isArrayItem: boolean) => void
}

export type ReactiveExpr = {
  get(): unknown
  subscribe(cb: (value: unknown) => void): () => void
}

export type CompiledExpr = ((root: Element) => unknown) & {
  reactive?: (root: Element) => ReactiveExpr
}

function hasReactiveSource(src: Source): boolean {
  if (src.kind === 'watch' || src.kind === 'await') {
    return true
  }
  return false
}

function isReactive(expr: Expr): boolean {
  if (expr.kind !== 'pipeline') {
    return false
  }
  return hasReactiveSource(expr.source)
}

export function compile(
  src: string,
  options: CompileOptions = {},
): CompiledExpr {
  const ast = parse(src)
  const locale = options.locale ?? 'en'
  const onElement = options.onElement

  const rootEnv = (root: Element): Env => new Map([['', root]])

  const fn: CompiledExpr = (root: Element) =>
    evalExpr(ast, root, rootEnv(root), locale, '', onElement)

  if (isReactive(ast)) {
    fn.reactive = (root: Element) =>
      buildReactive(
        ast as Expr & { kind: 'pipeline' },
        root,
        rootEnv(root),
        locale,
        onElement,
      )
  }

  return fn
}

function buildReactive(
  expr: Expr & { kind: 'pipeline' },
  root: Element,
  env: Env,
  locale: string,
  onElement: CompileOptions['onElement'] = undefined,
): ReactiveExpr {
  const subscribers = new Set<(value: unknown) => void>()
  let currentValue: unknown
  let started = false
  let dispose: (() => void) | null = null

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
    dispose = setupReactiveSource(expr.source, root, (ctx) => {
      const result = evalPipelineTail(
        { source: expr.source, tail: expr.tail },
        ctx,
        env,
        locale,
        '',
        onElement,
      )
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

function selectorToObserveTarget(selector: string, root: Element): Element {
  const el = root.querySelector(selector)
  return el?.parentElement ?? root
}

function setupReactiveSource(
  src: Source,
  root: Element,
  onValue: (ctx: Element) => void,
): () => void {
  if (src.kind === 'watch') {
    const inner = src.inner
    const innerSrc = unwrapInner(inner)
    const target = innerSrc ? selectorToObserveTarget(innerSrc, root) : root

    const run = () => onValue(root)
    run()

    const observer = new MutationObserver(run)
    observer.observe(target, {
      childList: true,
      subtree: true,
      attributes: true,
      characterData: true,
    })
    return () => observer.disconnect()
  }

  if (src.kind === 'await') {
    const condition = src.condition ?? selectorForAwait(src.inner)
    let innerDispose: (() => void) | null = null

    const check = () => {
      if (!condition || root.querySelector(condition)) {
        observer.disconnect()
        innerDispose = setupReactiveSource(src.inner, root, onValue)
      }
    }

    const observer = new MutationObserver(check)
    observer.observe(root, { childList: true, subtree: true, attributes: true })
    check()

    return () => {
      observer.disconnect()
      innerDispose?.()
    }
  }

  onValue(root)
  return () => {}
}

function unwrapInner(src: Source): string | null {
  if (src.kind === 'each' || src.kind === 'single') {
    return src.selector
  }
  if (src.kind === 'alias_each' || src.kind === 'alias_single') {
    return src.selector
  }
  if (src.kind === 'watch' || src.kind === 'await') {
    return unwrapInner(src.inner)
  }
  return null
}

function selectorForAwait(src: Source): string | null {
  if (src.kind === 'each' || src.kind === 'single') {
    return src.selector
  }
  if (src.kind === 'alias_each' || src.kind === 'alias_single') {
    return src.selector
  }
  return null
}

function evalPipelineTail(
  expr: { source: Source; tail: PipelineTail[] },
  root: Element,
  env: Env,
  locale: string,
  label: string,
  onElement: CompileOptions['onElement'],
): unknown {
  const unwrapped = unwrapSource(expr.source)
  return evalPipeline({ source: unwrapped, tail: expr.tail }, root, env, locale, label, onElement)
}

function unwrapSource(src: Source): Source {
  if (src.kind === 'watch' || src.kind === 'await') {
    return unwrapSource(src.inner)
  }
  return src
}

function evalExpr(
  expr: Expr,
  ctx: Element,
  env: Env,
  locale: string,
  label: string,
  onElement: CompileOptions['onElement'],
): unknown {
  switch (expr.kind) {
    case 'literal':
      return expr.value
    case 'array': {
      const result: unknown[] = []
      for (const item of expr.items) {
        const value = evalExpr(item, ctx, env, locale, label, onElement)
        if (Array.isArray(value)) {
          result.push(...value)
        } else {
          result.push(value)
        }
      }
      return result
    }
    case 'object':
      return evalFields(expr.fields, ctx, env, locale, label, onElement)
    case 'match':
      return evalMatch(expr.arms, ctx, env, locale, label, onElement)
    case 'pipeline':
      return evalPipeline(expr, ctx, env, locale, label, onElement)
  }
}

function evalFields(
  fields: Field[],
  ctx: Element,
  env: Env,
  locale: string,
  label: string,
  onElement: CompileOptions['onElement'],
): Record<string, unknown> {
  const result: Record<string, unknown> = {}
  for (const field of fields) {
    if ('expr' in field) {
      const value = evalExpr(field.value, ctx, env, locale, label, onElement)
      if (value !== null && value !== OMIT && typeof value === 'object') {
        Object.assign(result, value)
      }
    } else if (field.dynamic) {
      const key = evalExpr(field.keyExpr, ctx, env, locale, label, onElement)
      const value = evalExpr(field.value, ctx, env, locale, label, onElement)
      if (typeof key === 'string') {
        result[key] = value
      }
    } else {
      const fieldLabel = label ? `${label}.${field.key}` : field.key
      const value = evalExpr(field.value, ctx, env, locale, fieldLabel, onElement)
      if (value !== OMIT) {
        result[field.key] = value
      }
    }
  }
  return result
}

function evalMatch(
  arms: MatchArm[],
  ctx: Element,
  env: Env,
  locale: string,
  label: string,
  onElement: CompileOptions['onElement'],
): unknown {
  for (const arm of arms) {
    if (arm.kind === 'fallback') {
      return evalExpr(arm.body, ctx, env, locale, label, onElement)
    }
    const el = ctx.querySelector(arm.selector)
    if (el) {
      return evalExpr(arm.body, el, env, locale, label, onElement)
    }
  }
  return undefined
}

function evalPipeline(
  expr: { source: Source; tail: PipelineTail[] },
  ctx: Element,
  env: Env,
  locale: string,
  label: string,
  onElement: CompileOptions['onElement'],
): unknown {
  let current: unknown
  let omitOnNull = false
  let currentEnv = env

  const src =
    expr.source.kind === 'watch' || expr.source.kind === 'await'
      ? unwrapSource(expr.source)
      : expr.source

  switch (src.kind) {
    case 'context':
      current = ctx
      break
    case 'root_ref':
      current = currentEnv.get('') ?? null
      break
    case 'alias_ref':
      current = currentEnv.get(src.name) ?? null
      break
    case 'single': {
      const el = ctx.querySelector(src.selector) ?? null
      if (el && onElement) {
        onElement(el, label, false)
      }
      current = el
      omitOnNull = src.omit
      break
    }
    case 'each': {
      const els = Array.from(ctx.querySelectorAll(src.selector))
      if (onElement) {
        for (const el of els) onElement(el, label, true)
      }
      current = els
      break
    }
    case 'alias_each': {
      currentEnv = new Map(env)
      currentEnv.set(src.name, ctx)
      const els = Array.from(ctx.querySelectorAll(src.selector))
      if (onElement) {
        for (const el of els) onElement(el, label, true)
      }
      current = els
      break
    }
    case 'alias_single': {
      currentEnv = new Map(env)
      currentEnv.set(src.name, ctx)
      const el = ctx.querySelector(src.selector) ?? null
      if (el && onElement) {
        onElement(el, label, false)
      }
      current = el
      omitOnNull = src.omit
      break
    }
  }

  for (const step of expr.tail) {
    switch (step.kind) {
      case 'colon_transform':
        if (current == null && omitOnNull) {
          return OMIT
        }
        current = applyColonOp(step.op, current)
        break

      case 'pipe_transform':
        if (current == null && omitOnNull) {
          return OMIT
        }
        current = applyPipeOp(step.op, current, ctx, locale)
        break

      case 'fallback_selector':
        if (!current) {
          const el = ctx.querySelector(step.selector) ?? null
          if (el && onElement) {
            onElement(el, label, false)
          }
          current = el
        }
        break

      case 'block': {
        const isEach = src.kind === 'each' || src.kind === 'alias_each'
        if (isEach) {
          const aliasName = src.kind === 'alias_each' ? src.name : null
          current = (current as Element[]).map((el) => {
            const iterEnv = aliasName
              ? new Map([...currentEnv, [aliasName, el]])
              : currentEnv
            return evalFields(step.fields, el, iterEnv, locale, label, onElement)
          })
        } else {
          if (current == null) {
            return omitOnNull ? OMIT : null
          }
          current = evalFields(
            step.fields,
            current as Element,
            currentEnv,
            locale,
            label,
            onElement,
          )
        }
        break
      }

      case 'conditional': {
        const truthy = current != null && current !== false && current !== ''
        if (truthy) {
          return evalExpr(step.then_, ctx, currentEnv, locale, label, onElement)
        }
        if (step.else_) {
          return evalExpr(step.else_, ctx, currentEnv, locale, label, onElement)
        }
        return OMIT
      }

      case 'scoped_expr':
        if (current == null) {
          return omitOnNull ? OMIT : null
        }
        return evalExpr(step.expr, current as Element, currentEnv, locale, label, onElement)
    }
  }

  if (current == null && omitOnNull) {
    return OMIT
  }
  return current
}

function applyColonOp(op: ColonOp, value: unknown): unknown {
  switch (op.name) {
    case 'text':
      return (value as Element | null)?.textContent ?? null
    case 'attr':
      return (value as Element | null)?.getAttribute(op.arg) ?? null
    case 'data':
      return (value as Element | null)?.getAttribute(`data-${op.arg}`) ?? null
    case 'exists':
      return value != null
  }
}

function parseNumber(str: string, locale: string): number {
  const fmt = new Intl.NumberFormat(locale)
  const parts = fmt.formatToParts(1111.1)
  const group = parts.find((p) => p.type === 'group')?.value ?? ','
  const decimal = parts.find((p) => p.type === 'decimal')?.value ?? '.'
  const normalized = str.replaceAll(group, '').replace(decimal, '.')
  return parseFloat(normalized)
}

function applyPipeOp(
  op: PipeOp,
  value: unknown,
  ctx: Element,
  locale: string,
): unknown {
  const { name, args } = op
  switch (name) {
    case 'media': {
      const el = value as HTMLImageElement | HTMLVideoElement | null
      if (!el) {
        return null
      }
      const url = el.getAttribute('src') ?? ''
      const result: Record<string, unknown> = { url }
      const w = el.getAttribute('width')
      const h = el.getAttribute('height')
      if (w && h) {
        result['dimensions'] = {
          width: parseInt(w, 10),
          height: parseInt(h, 10),
        }
      }
      return result
    }
    case 'number': {
      if (value == null) {
        return null
      }
      const kwLocale = args.find(
        (a): a is Extract<PipeArg, object> =>
          typeof a === 'object' &&
          (a as Extract<PipeArg, object>).key === 'locale',
      )
      return parseNumber(
        String(value),
        kwLocale ? String(kwLocale.value) : locale,
      )
    }
    case 'url': {
      if (!value) {
        return null
      }
      try {
        return new URL(String(value), location.href).href
      } catch {
        return value
      }
    }
    case 'expandSuffix': {
      if (value == null) {
        return null
      }
      const m = String(value)
        .trim()
        .match(/^([\d.]+)\s*([KkMmBb])?/)
      if (!m) {
        return value
      }
      if (!m[1]) {
        return value
      }
      const n = parseFloat(m[1])
      const s = m[2]?.toUpperCase()
      if (s === 'K') {
        return n * 1_000
      }
      if (s === 'M') {
        return n * 1_000_000
      }
      if (s === 'B') {
        return n * 1_000_000_000
      }
      return n
    }
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
    default:
      throw new Error(`unknown pipe function: ${name}`)
  }
}
