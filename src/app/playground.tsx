/* @refresh reload */
import { render } from 'solid-js/web'
import {
  For,
  Show,
  createEffect,
  createResource,
  createSignal,
  onCleanup,
  onMount,
} from 'solid-js'
import { sendMessage } from 'webext-bridge/popup'
import { JsonataExpression } from '~/extraction/jsonata-bindings'
import { EntityValidator } from '~/extraction/entity-validator'
import { allSites } from '~/sites'
import type {
  LoaderInfo,
  LoaderFixture,
  CaptureEntry,
} from '~/generation/types'
import Resizable from '@corvu/resizable'
import {
  createHighlighterCore,
  createCssVariablesTheme,
} from 'shiki/dist/core.mjs'
import { createJavaScriptRegexEngine } from 'shiki/dist/engine-javascript.mjs'
import jsonataGrammar from './jsonata.tmLanguage.json'
import {
  EditorView,
  Decoration,
  type DecorationSet,
  ViewPlugin,
  type ViewUpdate,
  WidgetType,
} from '@codemirror/view'
import {
  EditorState,
  RangeSetBuilder,
  StateEffect,
  StateField,
} from '@codemirror/state'
import {
  syntaxHighlighting,
  foldGutter,
  foldKeymap,
  foldedRanges,
  unfoldEffect,
  foldEffect,
  syntaxTree,
  foldInside,
  codeFolding,
  unfoldAll,
} from '@codemirror/language'
import { classHighlighter } from '@lezer/highlight'
import {
  autocompletion,
  type CompletionContext,
  acceptCompletion,
  completionStatus,
} from '@codemirror/autocomplete'
import { keymap } from '@codemirror/view'
import { json } from '@codemirror/lang-json'
import { jsonataLanguage } from './jsonata-language'
import '@unocss/reset/tailwind-compat.css'
import 'virtual:uno.css'
import './app.css'
import './scrape-viewer.css'

const IS_DEV = import.meta.env.DEV

const [highlighter] = createResource(async () => {
  const jsonLang = await import('shiki/dist/langs/json.mjs')
  return createHighlighterCore({
    langs: [
      jsonLang.default,
      {
        ...jsonataGrammar,
      } as NonNullable<
        Parameters<typeof createHighlighterCore>[0]['langs']
      >[number],
    ],
    themes: [
      createCssVariablesTheme({
        name: 'css-vars',
        variablePrefix: '--shiki-',
        variableDefaults: {},
      }),
    ],
    engine: createJavaScriptRegexEngine(),
  })
})

function HighlightedCode({
  code,
  lang,
}: {
  code: () => string
  lang: 'json' | 'jsonata'
}) {
  let ref: HTMLDivElement | undefined

  createEffect(() => {
    const h = highlighter()
    const src = code()
    if (!ref) {
      return
    }
    if (!h) {
      ref.textContent = src
      return
    }
    const id = requestIdleCallback(() => {
      try {
        ref!.innerHTML = h.codeToHtml(src, { lang, theme: 'css-vars' })
      } catch {
        ref!.textContent = src
      }
    })
    onCleanup(() => cancelIdleCallback(id))
  })

  return <div ref={ref} class='text-xs' />
}

class EntityPreviewWidget extends WidgetType {
  constructor(
    readonly entity: string,
    readonly id: string | null,
    readonly canonicalUrl: string | null,
    readonly bracePos: number,
    readonly view: EditorView,
  ) {
    super()
  }
  eq(other: EntityPreviewWidget) {
    return (
      other.entity === this.entity &&
      other.id === this.id &&
      other.canonicalUrl === this.canonicalUrl &&
      other.bracePos === this.bracePos
    )
  }
  toDOM() {
    const wrap = document.createElement('span')
    wrap.className = 'cm-entity-preview'
    const label = document.createElement('span')
    label.textContent =
      this.id != null ? `${this.entity} · ${this.id}` : this.entity
    label.addEventListener('click', () => {
      const folded = foldedRanges(this.view.state)
      folded.between(this.bracePos, this.bracePos + 1, (from, to) => {
        this.view.dispatch({ effects: unfoldEffect.of({ from, to }) })
      })
    })
    wrap.appendChild(label)
    if (this.canonicalUrl) {
      const link = document.createElement('a')
      link.href = this.canonicalUrl
      link.target = '_blank'
      link.rel = 'noopener noreferrer'
      link.className = 'cm-entity-link'
      link.textContent = '↗'
      wrap.appendChild(link)
    }
    return wrap
  }
  ignoreEvent() {
    return false
  }
}

interface PatchMeta {
  entity: string
  id: string | null
  canonicalUrl: string | null
}

const setPatchMetas = StateEffect.define<{
  metas: PatchMeta[]
  raw: unknown[]
}>()

const idToUrlField = StateField.define<PatchMeta[]>({
  create: () => [],
  update: (val, tr) => {
    for (const e of tr.effects) {
      if (e.is(setPatchMetas)) {
        return e.value.metas
      }
    }
    return val
  },
})

const rawPatchesField = StateField.define<unknown[]>({
  create: () => [],
  update: (val, tr) => {
    for (const e of tr.effects) {
      if (e.is(setPatchMetas)) {
        return e.value.raw
      }
    }
    return val
  },
})

function buildObjectTypeMap(
  state: EditorState,
  patches: unknown[],
): Map<number, string> {
  const map = new Map<number, string>()
  const tree = syntaxTree(state)
  function walk(
    node: ReturnType<typeof syntaxTree>['topNode'],
    value: unknown,
  ) {
    if (node.name === 'Object' && value !== null && typeof value === 'object') {
      const t = (value as Record<string, unknown>)._type
      if (typeof t === 'string') {
        map.set(node.from, t)
      }
      let prop = node.firstChild
      while (prop) {
        if (prop.name === 'Property') {
          const keyNode = prop.firstChild
          if (keyNode) {
            const key = state.doc.sliceString(keyNode.from + 1, keyNode.to - 1)
            const valNode = keyNode.nextSibling?.nextSibling
            if (valNode) {
              walk(valNode, (value as Record<string, unknown>)[key])
            }
          }
        }
        prop = prop.nextSibling
      }
    } else if (node.name === 'Array' && Array.isArray(value)) {
      let child = node.firstChild
      let i = 0
      while (child) {
        if (child.name !== '[' && child.name !== ']' && child.name !== ',') {
          walk(child, value[i++])
        }
        child = child.nextSibling
      }
    }
  }
  const root = tree.topNode.firstChild
  if (root?.name === 'Array') {
    let child = root.firstChild
    let i = 0
    while (child) {
      if (child.name === 'Object') {
        walk(child, patches[i++])
      }
      child = child.nextSibling
    }
  }
  return map
}

const objectTypeMapField = StateField.define<Map<number, string>>({
  create: () => new Map(),
  update: (val, tr) => {
    for (const e of tr.effects) {
      if (e.is(setPatchMetas)) {
        return buildObjectTypeMap(tr.state, e.value.raw)
      }
    }
    if (tr.docChanged) {
      const patches = tr.state.field(rawPatchesField)
      return buildObjectTypeMap(tr.state, patches)
    }
    return val
  },
})

const entityPreviewPlugin = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet
    constructor(v: EditorView) {
      this.decorations = this.compute(v)
    }
    update(u: ViewUpdate) {
      if (
        u.docChanged ||
        u.viewportChanged ||
        u.transactions.some(
          (t) => t.reconfigured || t.effects.some((e) => e.is(setPatchMetas)),
        )
      ) {
        this.decorations = this.compute(u.view)
      } else {
        const oldFolded = foldedRanges(u.startState)
        const newFolded = foldedRanges(u.state)
        if (oldFolded !== newFolded) {
          this.decorations = this.compute(u.view)
        }
      }
    }
    compute(view: EditorView): DecorationSet {
      const patches = view.state.field(idToUrlField)
      const folded = foldedRanges(view.state)
      const builder = new RangeSetBuilder<Decoration>()
      const tree = syntaxTree(view.state)
      const root = tree.topNode
      const arrayNode = root.firstChild
      if (!arrayNode || arrayNode.name !== 'Array') {
        return builder.finish()
      }
      let patchIndex = 0
      let child = arrayNode.firstChild
      while (child) {
        if (child.name === 'Object') {
          const patch = patches[patchIndex++]
          if (patch) {
            const bracePos = child.from
            let isFolded = false
            folded.between(bracePos + 1, bracePos + 2, () => {
              isFolded = true
            })
            if (isFolded) {
              builder.add(
                bracePos + 1,
                bracePos + 1,
                Decoration.widget({
                  widget: new EntityPreviewWidget(
                    patch.entity,
                    patch.id,
                    patch.canonicalUrl,
                    bracePos,
                    view,
                  ),
                  side: 1,
                }),
              )
            }
          }
        }
        child = child.nextSibling
      }
      return builder.finish()
    }
  },
  { decorations: (v) => v.decorations },
)

function foldAllObjects(view: EditorView) {
  const tree = syntaxTree(view.state)
  const effects: ReturnType<typeof foldEffect.of>[] = []
  const root = tree.topNode.firstChild
  if (!root || root.name !== 'Array') {
    return
  }
  let child = root.firstChild
  while (child) {
    if (child.name === 'Object') {
      const range = foldInside(child)
      if (range) {
        effects.push(foldEffect.of(range))
      }
    }
    child = child.nextSibling
  }
  if (effects.length > 0) {
    view.dispatch({ effects })
  }
}

function JsonViewer({
  code,
  validationErrors = () => [],
  idToUrl,
  rawPatches,
  foldByDefault = false,
  unfoldSignal,
  foldKey,
}: {
  code: () => string | null
  validationErrors?: () => string[]
  idToUrl?: () => PatchMeta[]
  rawPatches?: () => unknown[]
  foldByDefault?: boolean
  unfoldSignal?: () => unknown
  foldKey?: () => unknown
}) {
  let container: HTMLDivElement | undefined
  let view: EditorView | undefined

  const jsonTheme = EditorView.theme(
    {
      '&': {
        height: '100%',
        background: 'transparent',
        fontSize: '0.75rem',
        color: 'var(--foreground)',
      },
      '.cm-scroller': {
        fontFamily:
          'source-code-pro, Menlo, Monaco, Consolas, "Courier New", monospace',
        lineHeight: '1.6',
        overflow: 'auto',
      },
      '.cm-content': { padding: '0.5rem' },
      '.cm-focused': { outline: 'none' },
      '.cm-gutters': {
        background: 'transparent',
        border: 'none',
        color: 'var(--muted-foreground)',
      },
      '.cm-foldGutter span': { cursor: 'pointer' },
      '.cm-entity-preview': {
        marginLeft: '0.5em',
        marginRight: '0.5em',
        color: 'var(--muted-foreground)',
        fontStyle: 'italic',
        fontSize: '0.7rem',
        cursor: 'pointer',
      },
      '.cm-entity-link': {
        marginLeft: '0.4em',
        padding: '0.1em 0.4em',
        color: 'var(--muted-foreground)',
        textDecoration: 'none',
        fontStyle: 'normal',
        fontSize: '0.7rem',
        border: '1px solid var(--border)',
        borderRadius: '3px',
        verticalAlign: 'middle',
      },
      '.cm-entity-link:hover': {
        color: 'var(--foreground)',
        borderColor: 'var(--ring)',
      },
    },
    { dark: window.matchMedia('(prefers-color-scheme: dark)').matches },
  )

  onMount(() => {
    view = new EditorView({
      state: EditorState.create({
        doc: code() ?? '',
        extensions: [
          json(),
          syntaxHighlighting(classHighlighter),
          foldGutter(),
          keymap.of(foldKeymap),
          codeFolding({
            preparePlaceholder: (state, range) => {
              const tree = syntaxTree(state)
              const node = tree.resolveInner(range.from, 1)
              const isTopLevel =
                node.parent?.name === 'Array' &&
                node.parent?.parent?.name === 'JsonText'
              const objectFrom =
                node.name === 'Object' ? node.from : node.from - 1
              const typeMap = state.field(objectTypeMapField, false)
              const type = typeMap?.get(objectFrom) ?? null
              return { isTopLevel, type }
            },
            placeholderDOM: (_view, onclick, prepared) => {
              const span = document.createElement('span')
              span.onclick = onclick
              span.style.cursor = 'pointer'
              if (!prepared?.isTopLevel) {
                const typeIcons: Record<string, string> = {
                  image: '🖼',
                  video: '▶',
                  date: '📅',
                  timestamp: '📅',
                  ref: '→',
                }
                const t = prepared?.type
                span.textContent = t
                  ? typeIcons[t]
                    ? `${typeIcons[t]} ${t}`
                    : t
                  : '…'
                span.style.color = 'var(--muted-foreground)'
                span.style.padding = '0 0.4em'
              }
              return span
            },
          }),
          ...(idToUrl
            ? [
                idToUrlField,
                rawPatchesField,
                objectTypeMapField,
                entityPreviewPlugin,
              ]
            : [rawPatchesField, objectTypeMapField]),
          EditorState.readOnly.of(true),
          jsonTheme,
        ],
      }),
      parent: container!,
    })
    onCleanup(() => view!.destroy())
  })

  createEffect(() => {
    const metas = idToUrl?.()
    const raw = rawPatches?.() ?? []
    if (!view || !metas) {
      return
    }
    view.dispatch({ effects: setPatchMetas.of({ metas, raw }) })
  })

  let hasFoldedOnce = false
  createEffect(() => {
    foldKey?.()
    hasFoldedOnce = false
  })

  createEffect(() => {
    const src = code() ?? ''
    const hasErrors = validationErrors().length > 0
    if (!view || view.state.doc.toString() === src) {
      return
    }
    view.dispatch({
      changes: { from: 0, to: view.state.doc.length, insert: src },
    })
    if (foldByDefault && !hasErrors && src && !hasFoldedOnce) {
      hasFoldedOnce = true
      requestAnimationFrame(() => {
        if (view) foldAllObjects(view)
      })
    }
  })

  let unfoldInitialized = false
  createEffect(() => {
    unfoldSignal?.()
    if (!unfoldInitialized) {
      unfoldInitialized = true
      return
    }
    if (!view) {
      return
    }
    unfoldAll(view)
  })

  return <div ref={container} class='h-full' />
}

function JsonataEditor({
  value,
  onInput,
  entityNames,
}: {
  value: () => string
  onInput: (v: string) => void
  entityNames: string[]
}) {
  let container: HTMLDivElement | undefined
  let view: EditorView | undefined

  const unknownEntityMark = Decoration.mark({ class: 'cm-unknown-entity' })

  function buildEntityDecorations(doc: EditorState['doc']): DecorationSet {
    const builder = new RangeSetBuilder<Decoration>()
    const text = doc.toString()
    const re = /"_entity"\s*:\s*"([^"]*)"/g
    let m: RegExpExecArray | null
    while ((m = re.exec(text)) !== null) {
      const name = m[1]
      if (name && !entityNames.includes(name)) {
        const valueStart =
          m.index + m[0].indexOf('"', m[0].indexOf(':') + 1) + 1
        builder.add(valueStart, valueStart + name.length, unknownEntityMark)
      }
    }
    return builder.finish()
  }

  const entityValidationPlugin = ViewPlugin.fromClass(
    class {
      decorations: DecorationSet
      constructor(view: EditorView) {
        this.decorations = buildEntityDecorations(view.state.doc)
      }
      update(update: ViewUpdate) {
        if (update.docChanged) {
          this.decorations = buildEntityDecorations(update.state.doc)
        }
      }
    },
    { decorations: (v) => v.decorations },
  )

  const entityFieldMap = Object.fromEntries(
    allSites.flatMap((s) =>
      s.entities.map((e) => [e.entity, Object.keys(e.fields.properties ?? {})]),
    ),
  )

  function entityCompletion(context: CompletionContext) {
    const before = context.state.doc.sliceString(0, context.pos)
    const entityNameMatch = before.match(/"_entity"\s*:\s*"([^"]*)$/)
    if (entityNameMatch && entityNameMatch[1]) {
      const from = context.pos - entityNameMatch[1].length
      return {
        from,
        options: entityNames.map((name) => ({ label: name, type: 'constant' })),
      }
    }
    const keyMatch = before.match(/(?:^|[{,]\s*)"([^"]*)$/)
    if (!keyMatch || !keyMatch[1]) {
      return null
    }
    const from = context.pos - keyMatch[1].length
    let depth = 0
    let objectStart = -1
    for (let i = before.length - 1; i >= 0; i--) {
      const ch = before[i]
      if (ch === '}') depth++
      else if (ch === '{') {
        if (depth === 0) {
          objectStart = i
          break
        }
        depth--
      }
    }
    const objectText = objectStart >= 0 ? before.slice(objectStart) : before
    const existingKeys = new Set<string>()
    const existingRe = /"([^"]+)"\s*:/g
    let em: RegExpExecArray | null
    while ((em = existingRe.exec(objectText)) !== null) {
      existingKeys.add(em[1]!)
    }
    const entityMatch = objectText.match(/"_entity"\s*:\s*"([^"]+)"/)
    if (!entityMatch || !entityMatch[1]) {
      return existingKeys.has('_entity')
        ? null
        : {
            from,
            options: [{ label: '_entity', type: 'property' }],
          }
    }
    const fields = entityFieldMap[entityMatch[1]]
    if (!fields) {
      return null
    }
    return {
      from,
      options: fields
        .filter((f) => !existingKeys.has(f))
        .map((f) => ({ label: f, type: 'property' })),
    }
  }

  onMount(() => {
    view = new EditorView({
      state: EditorState.create({
        doc: value(),
        extensions: [
          jsonataLanguage,
          syntaxHighlighting(classHighlighter),
          entityValidationPlugin,
          autocompletion({ override: [entityCompletion] }),
          keymap.of([
            {
              key: 'Tab',
              run: (view) => {
                if (completionStatus(view.state) === 'active') {
                  return acceptCompletion(view)
                }
                view.dispatch(view.state.replaceSelection('\t'))
                return true
              },
            },
          ]),
          EditorView.updateListener.of((update) => {
            if (update.docChanged) {
              onInput(update.state.doc.toString())
            }
          }),
          EditorView.theme(
            {
              '&': {
                height: '100%',
                background: 'transparent',
                fontSize: '0.75rem',
                color: 'var(--foreground)',
              },
              '.cm-cursor, .cm-dropCursor': {
                borderLeftColor: 'var(--foreground)',
                borderLeftWidth: '2px',
              },
              '.cm-scroller': {
                fontFamily:
                  'source-code-pro, Menlo, Monaco, Consolas, "Courier New", monospace',
                lineHeight: '1.6',
                overflow: 'auto',
              },
              '.cm-content': { padding: '1rem' },
              '.cm-focused': { outline: 'none' },
              '.cm-unknown-entity': {
                textDecoration: 'underline wavy var(--destructive)',
                textDecorationSkipInk: 'none',
              },
              '.cm-tooltip': {
                background: 'var(--background)',
                border: '1px solid var(--border)',
                borderRadius: '4px',
              },
              '.cm-tooltip.cm-tooltip-autocomplete > ul': {
                fontFamily:
                  'source-code-pro, Menlo, Monaco, Consolas, "Courier New", monospace',
                fontSize: '0.75rem',
              },
              '.cm-tooltip.cm-tooltip-autocomplete > ul > li': {
                color: 'var(--foreground)',
                padding: '2px 8px',
              },
              '.cm-tooltip.cm-tooltip-autocomplete > ul > li[aria-selected]': {
                background: 'var(--accent)',
                color: 'var(--foreground)',
              },
            },
            { dark: window.matchMedia('(prefers-color-scheme: dark)').matches },
          ),
        ],
      }),
      parent: container!,
    })
    onCleanup(() => view!.destroy())
  })

  createEffect(() => {
    const newVal = value()
    if (!view || view.state.doc.toString() === newVal) {
      return
    }
    view.dispatch({
      changes: { from: 0, to: view.state.doc.length, insert: newVal },
    })
  })

  return <div ref={container} class='flex-1 overflow-hidden' />
}

function relativeTime(ts: number): string {
  const diff = Date.now() - ts
  if (diff < 60_000) {
    return `${Math.floor(diff / 1000)}s ago`
  }
  if (diff < 3_600_000) {
    return `${Math.floor(diff / 60_000)}m ago`
  }
  return `${Math.floor(diff / 3_600_000)}h ago`
}

const validator = new EntityValidator(allSites)

interface EvalResult {
  patches: unknown[]
  validationErrors: string[]
  raw: unknown
  error?: string
}

async function evaluate(
  expression: string,
  input: unknown,
  url: string,
  method: string,
  headers: Record<string, string>,
): Promise<EvalResult> {
  try {
    const expr = new JsonataExpression(expression, {
      request: { url, method, headers },
      response: { url, status: null, headers: {}, body: input },
    })
    const raw = await expr.evaluate(input)
    const items = raw === undefined ? [] : Array.isArray(raw) ? raw : [raw]
    const patches = items.filter(
      (item) => item !== null && typeof item === 'object' && '_entity' in item,
    )
    const validationErrors: string[] = []
    for (const patch of patches) {
      const name = (patch as Record<string, unknown>)._entity as string
      const errs = validator.validate(name, patch)
      for (const e of errs) {
        validationErrors.push(`${name}${e.path}: ${e.message}`)
      }
    }
    return { patches, validationErrors, raw }
  } catch (err) {
    const msg =
      err instanceof Error
        ? err.message
        : ((err as { message?: string })?.message ?? String(err))
    return { patches: [], validationErrors: [], raw: undefined, error: msg }
  }
}

function Playground() {
  const [loaders, setLoaders] = createSignal<LoaderInfo[]>([])
  const [loadersLoading, setLoadersLoading] = createSignal(true)

  const [selectedLoader, setSelectedLoader] = createSignal<LoaderInfo | null>(
    null,
  )
  const [expression, setExpression] = createSignal('')
  const [selectedFixture, setSelectedFixture] =
    createSignal<LoaderFixture | null>(null)
  const [selectedCapture, setSelectedCapture] =
    createSignal<CaptureEntry | null>(null)
  const [captures, setCaptures] = createSignal<CaptureEntry[]>([])
  const [captureStatuses, setCaptureStatuses] = createSignal<
    Record<string, 'empty' | 'has-entities' | 'error'>
  >({})
  const [captureHostname, setCaptureHostname] = createSignal<string | null>(
    null,
  )
  const [evalResult, setEvalResult] = createSignal<EvalResult | null>(null)
  const [writeStatus, setWriteStatus] = createSignal<
    'idle' | 'saving' | 'saved' | 'error'
  >('idle')
  const [llmStatus, setLlmStatus] = createSignal<
    'idle' | 'loading' | 'done' | 'error'
  >('idle')
  const [llmExplanation, setLlmExplanation] = createSignal<string | null>(null)
  const [llmError, setLlmError] = createSignal<string | null>(null)
  const [writeError, setWriteError] = createSignal<string | null>(null)
  const [inputTab, setInputTab] = createSignal<'fixture' | 'capture'>('capture')
  const [newCaptureIds, setNewCaptureIds] = createSignal<Set<string>>(new Set())

  async function refreshCaptures(
    hostname: string,
    request?: { method: string; url: string },
    flash = true,
  ) {
    try {
      const entries = await sendMessage(
        'get-captures',
        { hostname, request },
        { context: 'background', tabId: 0 },
      )
      if (flash) {
        const existing = new Set(captures().map((c) => c.id))
        const added = entries
          .filter((e) => !existing.has(e.id))
          .map((e) => e.id)
        if (added.length > 0) {
          setNewCaptureIds((prev) => new Set([...prev, ...added]))
          setTimeout(() => {
            setNewCaptureIds((prev) => {
              const next = new Set(prev)
              for (const id of added) {
                next.delete(id)
              }
              return next
            })
          }, 1500)
        }
      }
      setCaptures(entries)
    } catch (err) {
      console.error('[spatula] get-captures failed', err)
    }
  }

  async function refreshLoaders() {
    try {
      const fresh = await sendMessage('get-loaders', undefined, {
        context: 'background',
        tabId: 0,
      })
      setLoaders(fresh)
      setLoadersLoading(false)
      setSelectedLoader((prev) => {
        if (!prev) {
          return null
        }
        return fresh.find((l) => l.path === prev.path) ?? prev
      })
    } catch {}
  }

  onMount(async () => {
    refreshLoaders()
    const interval = setInterval(refreshLoaders, 2000)
    onCleanup(() => clearInterval(interval))

    const tabs = await chrome.tabs.query({ windowType: 'normal' })
    const extensionOrigin = new URL(chrome.runtime.getURL('')).origin
    const tab =
      tabs.find(
        (t) => t.url && !t.url.startsWith(extensionOrigin) && t.active,
      ) ?? tabs.find((t) => t.url && !t.url.startsWith(extensionOrigin))
    if (!tab?.url) {
      return
    }
    try {
      const hostname = new URL(tab.url).hostname
      setCaptureHostname(hostname)
    } catch (err) {
      console.error('[spatula] onMount error', err)
    }
  })

  createEffect(() => {
    const hostname = captureHostname()
    if (!hostname) {
      return
    }
    const request = selectedLoader()?.request
    refreshCaptures(hostname, request, false)
    const interval = setInterval(() => refreshCaptures(hostname, request), 2000)
    onCleanup(() => clearInterval(interval))
  })

  function selectLoader(loader: LoaderInfo) {
    setSelectedLoader(loader)
    setExpression(loader.expression)
    setEvalResult(null)
    setWriteStatus('idle')
    setSelectedFixture(loader.fixtures[0] ?? null)
    setSelectedCapture(null)
  }

  const activeInput = (): {
    data: unknown
    url: string
    method: string
    headers: Record<string, string>
  } | null => {
    if (inputTab() === 'capture') {
      const cap = selectedCapture()
      if (!cap) {
        return null
      }
      try {
        return {
          data: JSON.parse(cap.responseBody),
          url: cap.url,
          method: cap.method,
          headers: cap.requestHeaders,
        }
      } catch {
        return null
      }
    }
    const fixture = selectedFixture()
    if (!fixture) {
      return null
    }
    const f = fixture.data as {
      request?: {
        url?: string
        method?: string
        headers?: Record<string, string>
      }
      response?: { body?: unknown }
    }
    return {
      data: f.response?.body ?? fixture.data,
      url: f.request?.url ?? '',
      method: f.request?.method ?? 'GET',
      headers: f.request?.headers ?? {},
    }
  }

  createEffect(() => {
    const expr = expression()
    const currentInput = activeInput()
    if (!expr || !currentInput) {
      setEvalResult(null)
      return
    }
    const timer = setTimeout(async () => {
      const res = await evaluate(
        expr,
        currentInput.data,
        currentInput.url,
        currentInput.method,
        currentInput.headers,
      )
      setEvalResult(res)
    }, 30)
    return () => clearTimeout(timer)
  })

  createEffect(() => {
    const expr = expression()
    const currentCaptures = captures()
    if (!expr || currentCaptures.length === 0) {
      return
    }
    const timer = setTimeout(async () => {
      const statuses: Record<string, 'empty' | 'has-entities' | 'error'> = {}
      await Promise.all(
        currentCaptures.map(async (cap) => {
          let body: unknown
          try {
            body = JSON.parse(cap.responseBody)
          } catch {
            statuses[cap.id] = 'error'
            return
          }
          const res = await evaluate(
            expr,
            body,
            cap.url,
            cap.method,
            cap.requestHeaders,
          )
          if (res.error || res.validationErrors.length > 0) {
            statuses[cap.id] = 'error'
          } else {
            statuses[cap.id] = res.patches.length > 0 ? 'has-entities' : 'empty'
          }
        }),
      )
      setCaptureStatuses(statuses)
    }, 30)
    return () => clearTimeout(timer)
  })

  async function writeBack() {
    const loader = selectedLoader()
    if (!loader) {
      return
    }
    setWriteStatus('saving')
    setWriteError(null)
    const res = await sendMessage(
      'write-loader',
      { path: loader.path, content: expression() },
      { context: 'background', tabId: 0 },
    )
    if (res.ok) {
      setWriteStatus('saved')
      setTimeout(() => setWriteStatus('idle'), 2000)
    } else {
      setWriteStatus('error')
      setWriteError(res.error ?? 'Unknown error')
    }
  }

  async function generateJsonata() {
    const cap = selectedCapture()
    if (!cap) {
      return
    }
    setLlmStatus('loading')
    setLlmExplanation(null)
    setLlmError(null)
    const res = await sendMessage(
      'generate-jsonata',
      { captureId: cap.id, currentExpression: expression() },
      { context: 'background', tabId: 0 },
    )
    if (res.ok) {
      setExpression(res.expression)
      setLlmExplanation(res.explanation)
      setLlmStatus('done')
    } else {
      setLlmError(res.error)
      setLlmStatus('error')
    }
  }

  const loadersByGroup = () => {
    const all = loaders() ?? []
    const groups: Record<string, LoaderInfo[]> = {}
    for (const l of all) {
      groups[l.loader] ??= []
      groups[l.loader]!.push(l)
    }
    return Object.entries(groups)
  }

  const fixtureJson = () => {
    const fixture = selectedFixture()
    if (!fixture) {
      return null
    }
    return JSON.stringify(fixture.data, null, 2)
  }

  const captureJson = () => {
    const capture = selectedCapture()
    if (!capture) {
      return null
    }
    try {
      return JSON.stringify(JSON.parse(capture.responseBody), null, 2)
    } catch {
      return capture.responseBody
    }
  }

  const resultJson = () => {
    const res = evalResult()
    if (!res) {
      return null
    }
    return JSON.stringify(
      res.patches.length > 0 ? res.patches : res.raw,
      null,
      2,
    )
  }

  return (
    <div class='h-screen overflow-hidden bg-background text-foreground font-sans flex flex-col'>
      <div class='border-b border-border px-4 py-2 flex items-center gap-3'>
        <span class='font-semibold text-sm'>Spatula Playground</span>
        <Show when={IS_DEV}>
          <span class='text-xs px-1.5 py-0.5 rounded bg-yellow-500/15 text-yellow-600 dark:text-yellow-400'>
            dev
          </span>
        </Show>
      </div>

      <Resizable class='flex flex-1 overflow-hidden min-h-0'>
        <Resizable.Panel
          initialSize={0.15}
          minSize={0.1}
          class='border-r border-border overflow-y-auto flex flex-col [scrollbar-gutter:stable]'
        >
          <Show when={loadersLoading()}>
            <p class='text-xs text-muted-foreground p-3'>Loading...</p>
          </Show>
          <For each={loadersByGroup()}>
            {([group, files]) => (
              <div>
                <div class='px-3 py-1.5 text-xs font-medium sticky top-0 bg-background border-b border-border flex items-center gap-2 min-w-0 justify-between'>
                  <span class='text-muted-foreground uppercase tracking-wider shrink-0'>
                    {group}
                  </span>
                  <Show when={files[0]?.request}>
                    {(req) => (
                      <span
                        class='text-muted-foreground truncate font-mono normal-case tracking-normal'
                        style='font-size: 0.65rem'
                      >
                        <span class='uppercase'>{req().method}</span>{' '}
                        {req().url}
                      </span>
                    )}
                  </Show>
                </div>
                <For each={files}>
                  {(loader) => {
                    const isSelected = () =>
                      selectedLoader()?.path === loader.path
                    return (
                      <button
                        type='button'
                        onClick={() => selectLoader(loader)}
                        class={`w-full text-left px-3 py-1.5 text-xs font-mono truncate transition-colors hover:bg-accent ${isSelected() ? 'bg-accent text-foreground' : 'text-muted-foreground'}`}
                      >
                        {loader.file}
                      </button>
                    )
                  }}
                </For>
              </div>
            )}
          </For>
        </Resizable.Panel>

        <Resizable.Handle class='w-1 bg-border hover:bg-foreground/30 transition-colors cursor-col-resize' />

        <Resizable.Panel
          initialSize={0.85}
          minSize={0.1}
          class='flex overflow-hidden'
        >
          <Show
            when={selectedLoader()}
            fallback={
              <div class='flex-1 flex items-center justify-center text-sm text-muted-foreground'>
                Select a loader to get started
              </div>
            }
          >
            {(loader) => (
              <Resizable class='flex-1 flex overflow-hidden'>
                <Resizable.Panel
                  initialSize={0.333}
                  minSize={0.1}
                  class='flex flex-col overflow-hidden'
                >
                  <div class='border-b border-border px-3 py-1.5 flex items-center justify-between shrink-0'>
                    <span class='text-xs font-mono text-muted-foreground'>
                      {loader().path}
                    </span>
                    <Show when={IS_DEV}>
                      <button
                        type='button'
                        onClick={writeBack}
                        disabled={writeStatus() === 'saving'}
                        class={`text-xs px-2 py-1 rounded border transition-colors disabled:opacity-50 ${
                          writeStatus() === 'saved'
                            ? 'border-green-500 text-green-500'
                            : writeStatus() === 'error'
                              ? 'border-destructive text-destructive'
                              : 'border-border hover:bg-accent'
                        }`}
                      >
                        {writeStatus() === 'saving'
                          ? 'Saving...'
                          : writeStatus() === 'saved'
                            ? 'Saved'
                            : writeStatus() === 'error'
                              ? 'Error'
                              : 'Write'}
                      </button>
                    </Show>
                  </div>
                  <Show when={writeStatus() === 'error' && writeError()}>
                    <div class='px-3 py-1.5 text-xs text-destructive border-b border-border bg-destructive/5 shrink-0'>
                      {writeError()}
                    </div>
                  </Show>
                  <JsonataEditor
                    value={expression}
                    onInput={setExpression}
                    entityNames={allSites.flatMap((s) =>
                      s.entities.map((e) => e.entity),
                    )}
                  />
                  <Show
                    when={
                      llmExplanation() ||
                      llmStatus() === 'loading' ||
                      llmStatus() === 'error'
                    }
                  >
                    <div class='border-t border-border bg-accent/50 shrink-0 max-h-48 overflow-y-auto'>
                      <Show when={llmStatus() === 'loading'}>
                        <p class='px-3 py-2 text-xs text-muted-foreground'>
                          Generating...
                        </p>
                      </Show>
                      <Show when={llmStatus() === 'error'}>
                        <p class='px-3 py-2 text-xs text-destructive font-mono'>
                          {llmError()}
                        </p>
                      </Show>
                      <Show when={llmExplanation()}>
                        <div class='px-3 py-2 text-xs text-foreground whitespace-pre-wrap font-sans leading-relaxed'>
                          {llmExplanation()}
                        </div>
                      </Show>
                    </div>
                  </Show>
                  <div class='px-3 py-2 border-t border-border shrink-0 flex items-center justify-between'>
                    <Show
                      when={selectedCapture()}
                      fallback={
                        <span class='text-xs text-muted-foreground'>
                          Select a capture to generate
                        </span>
                      }
                    >
                      <button
                        type='button'
                        onClick={generateJsonata}
                        disabled={llmStatus() === 'loading'}
                        class='text-xs px-2 py-1 rounded border border-border hover:bg-accent transition-colors disabled:opacity-50'
                      >
                        {llmStatus() === 'loading'
                          ? 'Generating...'
                          : '✦ Generate'}
                      </button>
                    </Show>
                    <Show when={llmStatus() === 'done'}>
                      <button
                        type='button'
                        onClick={() => {
                          setLlmStatus('idle')
                          setLlmExplanation(null)
                        }}
                        class='text-xs text-muted-foreground hover:text-foreground transition-colors'
                      >
                        dismiss
                      </button>
                    </Show>
                  </div>
                  <Show when={evalResult()?.error}>
                    <div
                      class='px-3 py-2 text-xs font-mono text-destructive border-t border-destructive/30 bg-destructive/5 shrink-0 truncate'
                      title={evalResult()?.error}
                    >
                      {evalResult()?.error}
                    </div>
                  </Show>
                </Resizable.Panel>

                <Resizable.Handle class='w-1 bg-border hover:bg-foreground/30 transition-colors cursor-col-resize' />

                <Resizable.Panel
                  initialSize={0.333}
                  minSize={0.1}
                  class='flex flex-col overflow-hidden'
                >
                  <div class='border-b border-border flex shrink-0'>
                    <button
                      type='button'
                      onClick={() => setInputTab('capture')}
                      class={`flex-1 px-3 py-1.5 text-xs transition-colors ${inputTab() === 'capture' ? 'text-foreground border-b-2 border-foreground' : 'text-muted-foreground hover:text-foreground'}`}
                    >
                      Captures ({captures().length})
                    </button>
                    <button
                      type='button'
                      onClick={() => setInputTab('fixture')}
                      class={`flex-1 px-3 py-1.5 text-xs transition-colors ${inputTab() === 'fixture' ? 'text-foreground border-b-2 border-foreground' : 'text-muted-foreground hover:text-foreground'}`}
                    >
                      Fixtures
                    </button>
                  </div>

                  <Show when={inputTab() === 'fixture'}>
                    <div class='flex flex-col overflow-hidden flex-1'>
                      <div class='border-b border-border flex flex-col gap-0.5 p-1.5 shrink-0'>
                        <For
                          each={loader().fixtures}
                          fallback={
                            <p class='text-xs text-muted-foreground px-1.5 py-1'>
                              No fixtures
                            </p>
                          }
                        >
                          {(fixture) => {
                            const isSelected = () =>
                              selectedFixture()?.name === fixture.name
                            return (
                              <button
                                type='button'
                                onClick={() => {
                                  setSelectedFixture(fixture)
                                  setSelectedCapture(null)
                                }}
                                class={`text-left px-2 py-1 rounded text-xs font-mono transition-colors ${isSelected() ? 'bg-accent text-foreground' : 'text-muted-foreground hover:bg-accent/50'}`}
                              >
                                {fixture.name}
                              </button>
                            )
                          }}
                        </For>
                      </div>
                      <div class='flex-1 overflow-auto [scrollbar-gutter:stable]'>
                        {fixtureJson() && (
                          <HighlightedCode code={fixtureJson} lang='json' />
                        )}
                      </div>
                    </div>
                  </Show>

                  <Show when={inputTab() === 'capture'}>
                    <div class='flex flex-col overflow-hidden flex-1'>
                      <div class='border-b border-border flex flex-col gap-0.5 p-1.5 shrink-0'>
                        <For
                          each={captures()}
                          fallback={
                            <p class='text-xs text-muted-foreground px-1.5 py-1'>
                              No recent captures
                            </p>
                          }
                        >
                          {(capture) => {
                            const isSelected = () =>
                              selectedCapture()?.id === capture.id
                            const status = () => captureStatuses()[capture.id]
                            const isEmpty = () => status() === 'empty'
                            const hasError = () => status() === 'error'
                            const isNew = () => newCaptureIds().has(capture.id)
                            return (
                              <button
                                type='button'
                                onClick={() => {
                                  setSelectedCapture(capture)
                                  setSelectedFixture(null)
                                }}
                                class={`text-left px-2 py-1 rounded text-xs font-mono transition-all duration-700 truncate flex items-center gap-1.5 ${isSelected() ? 'bg-accent text-foreground' : isNew() ? 'text-blue-400 hover:bg-accent/50' : isEmpty() ? 'text-muted-foreground/40 hover:bg-accent/50 hover:text-muted-foreground' : 'text-muted-foreground hover:bg-accent/50'}`}
                              >
                                <span class='uppercase shrink-0'>
                                  {capture.method}
                                </span>
                                <span class='truncate flex-1'>
                                  {new URL(capture.url).pathname}
                                </span>
                                <span class='shrink-0 text-muted-foreground/60'>
                                  {relativeTime(capture.capturedAt)}
                                </span>
                                <Show when={status() !== undefined}>
                                  <span
                                    class={`h-1.5 w-1.5 rounded-full shrink-0 ${hasError() ? 'bg-destructive' : isEmpty() ? 'bg-muted-foreground/30' : 'bg-green-500'}`}
                                    title={
                                      hasError()
                                        ? 'Validation errors'
                                        : isEmpty()
                                          ? 'No entities'
                                          : 'OK'
                                    }
                                  />
                                </Show>
                              </button>
                            )
                          }}
                        </For>
                      </div>
                      <div class='flex-1 overflow-hidden'>
                        <JsonViewer code={captureJson} />
                      </div>
                    </div>
                  </Show>
                </Resizable.Panel>

                <Resizable.Handle class='w-1 bg-border hover:bg-foreground/30 transition-colors cursor-col-resize' />

                <Resizable.Panel
                  initialSize={0.333}
                  minSize={0.1}
                  class='flex flex-col overflow-hidden'
                >
                  <div class='border-b border-border px-3 py-1.5 flex items-center gap-2 shrink-0'>
                    <span class='text-xs text-muted-foreground'>Result</span>
                    <Show when={evalResult()}>
                      {(res) => (
                        <>
                          <Show when={res().error}>
                            <span class='text-xs text-destructive ml-auto'>
                              error
                            </span>
                          </Show>
                          <Show when={!res().error}>
                            <span
                              class={`text-xs ml-auto ${res().validationErrors.length > 0 ? 'text-yellow-500' : 'text-green-500'}`}
                            >
                              {res().patches.length} patches
                              {res().validationErrors.length > 0
                                ? ` · ${res().validationErrors.length} errors`
                                : ''}
                            </span>
                          </Show>
                        </>
                      )}
                    </Show>
                  </div>
                  <Show when={evalResult()?.error}>
                    <div class='px-3 py-2 text-xs text-destructive font-mono shrink-0'>
                      {evalResult()?.error}
                    </div>
                  </Show>
                  <Show when={(evalResult()?.validationErrors.length ?? 0) > 0}>
                    <div class='border-b border-border px-3 py-2 flex flex-col gap-0.5 shrink-0'>
                      <For each={evalResult()!.validationErrors}>
                        {(err) => (
                          <span class='text-xs font-mono text-destructive'>
                            {err}
                          </span>
                        )}
                      </For>
                    </div>
                  </Show>
                  <div class='flex-1 overflow-hidden'>
                    <JsonViewer
                      code={resultJson}
                      validationErrors={() =>
                        evalResult()?.validationErrors ?? []
                      }
                      rawPatches={() => evalResult()?.patches ?? []}
                      unfoldSignal={expression}
                      foldKey={() =>
                        `${selectedFixture()?.name ?? ''}:${selectedCapture()?.id ?? ''}`
                      }
                      idToUrl={() => {
                        const patches = evalResult()?.patches ?? []
                        const entityCanonicalUrls = Object.fromEntries(
                          allSites.flatMap((s) =>
                            s.entities
                              .filter((e) => e.canonicalUrl)
                              .map((e) => [e.entity, e.canonicalUrl!]),
                          ),
                        )
                        return patches.map((patch) => {
                          const p = patch as Record<string, unknown>
                          const entity = p._entity as string
                          const id = p._id != null ? String(p._id) : null
                          const template = entityCanonicalUrls[entity]
                          const canonicalUrl = template
                            ? template.replace(/\{(\w+)\}/g, (_, key) =>
                                String(p[key] ?? ''),
                              )
                            : null
                          return { entity, id, canonicalUrl }
                        })
                      }}
                      foldByDefault
                    />
                  </div>
                  <Show
                    when={
                      !evalResult() && !selectedFixture() && !selectedCapture()
                    }
                  >
                    <p class='text-xs text-muted-foreground p-3'>
                      Select a fixture or capture
                    </p>
                  </Show>
                </Resizable.Panel>
              </Resizable>
            )}
          </Show>
        </Resizable.Panel>
      </Resizable>
    </div>
  )
}

const root = document.getElementById('root')!
render(() => <Playground />, root)
