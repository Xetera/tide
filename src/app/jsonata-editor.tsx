import { createEffect, onCleanup, onMount } from 'solid-js'
import {
  EditorView,
  Decoration,
  type DecorationSet,
  ViewPlugin,
  type ViewUpdate,
  WidgetType,
} from '@codemirror/view'
import { EditorState, RangeSetBuilder, StateEffect, StateField } from '@codemirror/state'
import { syntaxHighlighting } from '@codemirror/language'
import { classHighlighter } from '@lezer/highlight'
import {
  autocompletion,
  type CompletionContext,
  acceptCompletion,
  completionStatus,
} from '@codemirror/autocomplete'
import { keymap } from '@codemirror/view'
import { jsonataLanguage } from './jsonata-language'
import { allSites } from '~/sites'

export interface ErrorPosition {
  line: number
  col: number
  message: string
}

export function parseErrorPosition(msg: string): ErrorPosition | null {
  const m = msg.match(/^Line (\d+), col (\d+):/)
  if (!m) {
    return null
  }
  return { line: parseInt(m[1]!), col: parseInt(m[2]!), message: msg }
}

const setErrorEffect = StateEffect.define<ErrorPosition | null>()

class ErrorWidget extends WidgetType {
  constructor(readonly msg: string) { super() }
  toDOM() {
    const el = document.createElement('span')
    el.className = 'cm-error-widget'
    const lines = this.msg.split('\n')
    const detail = lines.find(l => l.startsWith('Expected') || l.startsWith('Failed') || (!l.startsWith('>') && !l.match(/^\s*\^/) && !l.match(/^Line \d/) && l.trim()))
    el.textContent = ' ' + (detail ?? lines[0] ?? this.msg)
    return el
  }
  ignoreEvent() { return true }
}

const errorField = StateField.define<DecorationSet>({
  create: () => Decoration.none,
  update(deco, tr) {
    for (const effect of tr.effects) {
      if (effect.is(setErrorEffect)) {
        const pos = effect.value
        if (!pos) {
          return Decoration.none
        }
        const line = tr.state.doc.line(Math.min(pos.line, tr.state.doc.lines))
        const col = Math.min(pos.col - 1, line.length)
        const from = line.from + col
        const firstLine = pos.message.split('\n')[0] ?? pos.message
        return Decoration.set([
          Decoration.line({ class: 'cm-error-line' }).range(line.from),
          Decoration.widget({ widget: new ErrorWidget(firstLine), side: 1 }).range(from),
        ])
      }
    }
    return deco.map(tr.changes)
  },
  provide: f => EditorView.decorations.from(f),
})

export function JsonataEditor({
  value,
  onInput,
  entityNames,
  errorPosition,
}: {
  value: () => string
  onInput: (v: string) => void
  entityNames: string[]
  errorPosition?: () => ErrorPosition | null
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
      if (ch === '}') {
        depth++
      } else if (ch === '{') {
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
          errorField,
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
              update.view.dispatch({ effects: setErrorEffect.of(null) })
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
              '.cm-error-line': {
                background: 'color-mix(in srgb, var(--destructive) 12%, transparent)',
              },
              '.cm-error-widget': {
                color: 'var(--destructive)',
                opacity: '0.8',
                fontStyle: 'italic',
                fontSize: '0.7rem',
                pointerEvents: 'none',
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

  createEffect(() => {
    if (!view || !errorPosition) {
      return
    }
    view.dispatch({ effects: setErrorEffect.of(errorPosition()) })
  })

  return <div ref={container} class='flex-1 overflow-hidden' />
}
