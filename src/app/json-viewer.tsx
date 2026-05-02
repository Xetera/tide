import {
  createEffect,
  onCleanup,
  onMount,
} from 'solid-js'
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
import { keymap } from '@codemirror/view'
import { json } from '@codemirror/lang-json'
import {
  createHighlighterCore,
  createCssVariablesTheme,
} from 'shiki/dist/core.mjs'
import { createJavaScriptRegexEngine } from 'shiki/dist/engine-javascript.mjs'
import jsonataGrammar from './jsonata.tmLanguage.json'
import { createResource } from 'solid-js'

export const [highlighter] = createResource(async () => {
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

export function HighlightedCode({
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

export interface PatchMeta {
  entity: string
  id: string | null
  canonicalUrl: string | null
}

export const setPatchMetas = StateEffect.define<{
  metas: PatchMeta[]
  raw: unknown[]
}>()


export const idToUrlField = StateField.define<PatchMeta[]>({
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

export const rawPatchesField = StateField.define<unknown[]>({
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

export function buildObjectTypeMap(
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

export const objectTypeMapField = StateField.define<Map<number, string>>({
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
          (t) =>
            t.reconfigured ||
            t.effects.some((e) => e.is(setPatchMetas)),
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

export function JsonViewer({
  code,
  validationErrors = () => [],
  idToUrl,
  rawPatches,
  identityWarnings,
  foldByDefault = false,
  unfoldSignal,
  foldKey,
}: {
  code: () => string | null
  validationErrors?: () => string[]
  idToUrl?: () => PatchMeta[]
  rawPatches?: () => unknown[]
  identityWarnings?: () => string[]
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
      '.cm-entity-warning': {
        marginLeft: '0.75em',
        color: 'var(--yellow-500, #eab308)',
        fontSize: '0.7rem',
        fontStyle: 'italic',
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
        if (view) {
          foldAllObjects(view)
        }
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
