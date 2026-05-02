import { parse } from './parser'
import type { EntityRef } from '~/site-spec/types'
import {
  LOCALE_SUFFIXES,
  localeFormatParts,
  expandLocaleSuffix,
  parseLocaleNumber,
} from '~/extraction/number-parser'
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

type Env = Map<string, Element>

const OMIT = Symbol('omit')

export type HighlightLabel = {
  entity: string
  field: string
}

export type CompileOptions = {
  locale?: string
  onElement?: (
    element: Element,
    label: HighlightLabel,
    isArrayItem: boolean,
  ) => void
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
  return hasReactiveSource(expr.primary.source)
}

export function compile(
  src: string,
  options: CompileOptions = {},
): CompiledExpr {
  const { expr: ast } = parse(src)
  const locale = options.locale ?? 'en'
  const onElement = options.onElement

  const rootEnv = (root: Element): Env => new Map([['', root]])

  const fn: CompiledExpr = (root: Element) =>
    evalExpr(ast, root, rootEnv(root), locale, '', '', onElement)

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
    dispose = setupReactiveSource(expr.primary.source, root, (ctx) => {
      const result = evalPipelineTail(
        expr.primary,
        ctx,
        env,
        locale,
        '',
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

function extractEntityFromFields(fields: Field[]): string {
  for (const field of fields) {
    if (!('expr' in field) && !field.dynamic && field.key === '_entity') {
      if (
        field.value.kind === 'literal' &&
        typeof field.value.value === 'string'
      ) {
        return field.value.value
      }
    }
  }
  return ''
}

function evalPipelineTail(
  expr: SimplePipeline,
  root: Element,
  env: Env,
  locale: string,
  label: string,
  entity: string,
  onElement: CompileOptions['onElement'],
): unknown {
  const unwrapped = unwrapSource(expr.source)
  return evalPipeline(
    { source: unwrapped, tail: expr.tail },
    root,
    env,
    locale,
    label,
    entity,
    onElement,
  )
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
  entity: string,
  onElement: CompileOptions['onElement'],
): unknown {
  switch (expr.kind) {
    case 'literal':
      return expr.value
    case 'array': {
      const result: unknown[] = []
      for (const item of expr.items) {
        const value = evalExpr(item, ctx, env, locale, label, entity, onElement)
        if (Array.isArray(value)) {
          result.push(...value)
        } else {
          result.push(value)
        }
      }
      return result
    }
    case 'object':
      return evalFields(expr.fields, ctx, env, locale, label, entity, onElement)
    case 'match':
      return evalMatch(expr.arms, ctx, env, locale, label, entity, onElement)
    case 'pipeline': {
      const primary = evalPipelineTail(
        expr.primary,
        ctx,
        env,
        locale,
        label,
        entity,
        onElement,
      )
      if ((primary == null || primary === OMIT) && expr.fallback) {
        return evalPipelineTail(
          expr.fallback,
          ctx,
          env,
          locale,
          label,
          entity,
          onElement,
        )
      }
      return primary
    }
  }
}

const EXCLUDED_FIELDS = new Set([
  '_id',
  '_entity',
  '_type',
  '_ref',
  '_createdAt',
])

function evalFields(
  fields: Field[],
  ctx: Element,
  env: Env,
  locale: string,
  label: string,
  entity: string,
  onElement: CompileOptions['onElement'],
): Record<string, unknown> {
  const blockEntity = extractEntityFromFields(fields) || entity
  const result: Record<string, unknown> = {}
  for (const field of fields) {
    if ('expr' in field) {
      const value = evalExpr(
        field.value,
        ctx,
        env,
        locale,
        label,
        blockEntity,
        onElement,
      )
      if (value !== null && value !== OMIT && typeof value === 'object') {
        Object.assign(result, value)
      }
    } else if (field.dynamic) {
      const key = evalExpr(
        field.keyExpr,
        ctx,
        env,
        locale,
        label,
        blockEntity,
        onElement,
      )
      const value = evalExpr(
        field.value,
        ctx,
        env,
        locale,
        label,
        blockEntity,
        onElement,
      )
      if (typeof key === 'string') {
        result[key] = value
      }
    } else {
      const fieldLabel = label ? `${label}.${field.key}` : field.key
      const value = evalExpr(
        field.value,
        ctx,
        env,
        locale,
        fieldLabel,
        blockEntity,
        onElement,
      )
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
  entity: string,
  onElement: CompileOptions['onElement'],
): unknown {
  for (const arm of arms) {
    if (arm.kind === 'fallback') {
      return evalExpr(arm.body, ctx, env, locale, label, entity, onElement)
    }
    if (arm.kind === 'each') {
      const els = Array.from(ctx.querySelectorAll(arm.selector))
      if (els.length === 0) {
        continue
      }
      return els.map((el) =>
        evalExpr(arm.body, el, env, locale, label, entity, onElement),
      )
    }
    const el = ctx.querySelector(arm.selector)
    if (el) {
      return evalExpr(arm.body, el, env, locale, label, entity, onElement)
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
  entity: string,
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
      const fieldName = label.split('.').pop() ?? label
      if (el && onElement && !EXCLUDED_FIELDS.has(fieldName)) {
        onElement(el, { entity, field: fieldName }, false)
      }
      current = el
      omitOnNull = src.omit
      break
    }
    case 'each': {
      current = Array.from(ctx.querySelectorAll(src.selector))
      break
    }
    case 'alias_each': {
      currentEnv = new Map(env)
      currentEnv.set(src.name, ctx)
      current = Array.from(ctx.querySelectorAll(src.selector))
      break
    }
    case 'alias_single': {
      currentEnv = new Map(env)
      currentEnv.set(src.name, ctx)
      const el = ctx.querySelector(src.selector) ?? null
      const fieldName = label.split('.').pop() ?? label
      if (el && onElement && !EXCLUDED_FIELDS.has(fieldName)) {
        onElement(el, { entity, field: fieldName }, false)
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

      case 'block': {
        const isEach = src.kind === 'each' || src.kind === 'alias_each'
        if (isEach) {
          const aliasName = src.kind === 'alias_each' ? src.name : null
          current = (current as Element[]).map((el) => {
            const iterEnv = aliasName
              ? new Map([...currentEnv, [aliasName, el]])
              : currentEnv
            const itemLabel = label ? `${label}[*]` : '[*]'
            return evalFields(
              step.fields,
              el,
              iterEnv,
              locale,
              itemLabel,
              entity,
              onElement,
            )
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
            entity,
            onElement,
          )
        }
        break
      }

      case 'conditional': {
        const truthy = current != null && current !== false && current !== ''
        if (truthy) {
          return evalExpr(
            step.then_,
            ctx,
            currentEnv,
            locale,
            label,
            entity,
            onElement,
          )
        }
        if (step.else_) {
          return evalExpr(
            step.else_,
            ctx,
            currentEnv,
            locale,
            label,
            entity,
            onElement,
          )
        }
        return OMIT
      }

      case 'scoped_expr':
        if (current == null) {
          return omitOnNull ? OMIT : null
        }
        return evalExpr(
          step.expr,
          current as Element,
          currentEnv,
          locale,
          label,
          entity,
          onElement,
        )
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

function applyPipeOp(
  op: PipeOp,
  value: unknown,
  ctx: Element,
  locale: string,
): unknown {
  const { name, args } = op
  switch (name) {
    case 'media':
    case 'image':
    case 'video': {
      const el = value as HTMLImageElement | HTMLVideoElement | null
      if (!el) {
        return null
      }
      const url = el.getAttribute('src') ?? ''
      let type: string
      if (name === 'image') {
        type = 'image'
      } else if (name === 'video') {
        type = 'video'
      } else {
        const ext = url.split('?')[0]!.split('.').pop()?.toLowerCase() ?? ''
        type = ext === 'mp4' || ext === 'webm' || ext === 'mov' || ext === 'ogg' ? 'video'
          : ext === 'jpg' || ext === 'jpeg' || ext === 'png' || ext === 'gif' || ext === 'webp' || ext === 'avif' || ext === 'svg' ? 'image'
          : 'media'
      }
      const result: Record<string, unknown> = { _type: type, url }
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
      return parseLocaleNumber(
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
      return expandLocaleSuffix(String(value), locale)
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
    case 'ref': {
      if (value == null) {
        return null
      }
      if (Array.isArray(value)) {
        return value.map((id): EntityRef => ({ _type: 'ref', _id: String(id) }))
      }
      return { _type: 'ref', _id: String(value) } satisfies EntityRef
    }
    default:
      throw new Error(`unknown pipe function: ${name}`)
  }
}
