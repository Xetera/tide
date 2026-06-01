export type Doc =
  | { kind: 'text'; value: string }
  | { kind: 'concat'; parts: Doc[] }
  | { kind: 'line'; soft: boolean; hard: boolean }
  | { kind: 'indent'; doc: Doc }
  | { kind: 'dedent'; doc: Doc }
  | { kind: 'group'; doc: Doc }
  | { kind: 'break-parent' }

export const breakParent: Doc = { kind: 'break-parent' }

export const text = (value: string): Doc => ({ kind: 'text', value })

export const concat = (parts: Doc[]): Doc => ({ kind: 'concat', parts })

export const indent = (doc: Doc): Doc => ({ kind: 'indent', doc })

export const dedent = (doc: Doc): Doc => ({ kind: 'dedent', doc })

export const group = (doc: Doc): Doc => ({ kind: 'group', doc })

export const line: Doc = { kind: 'line', soft: false, hard: false }

export const softline: Doc = { kind: 'line', soft: true, hard: false }

export const hardline: Doc = { kind: 'line', soft: false, hard: true }

export function join(sep: Doc, docs: Doc[]): Doc {
  const parts: Doc[] = []
  docs.forEach((doc, i) => {
    if (i > 0) {
      parts.push(sep)
    }
    parts.push(doc)
  })
  return concat(parts)
}

type Mode = 'flat' | 'break'

type Cmd = { indent: number; mode: Mode; doc: Doc }

function fits(width: number, next: Cmd, rest: Cmd[], indentSize: number): boolean {
  let remaining = width
  const cmds: Cmd[] = [next]
  let restIdx = rest.length

  while (remaining >= 0) {
    if (cmds.length === 0) {
      if (restIdx === 0) {
        return true
      }
      cmds.push(rest[--restIdx]!)
      continue
    }
    const { indent: ind, mode, doc } = cmds.pop()!
    switch (doc.kind) {
      case 'text':
        remaining -= doc.value.length
        break
      case 'concat':
        for (let i = doc.parts.length - 1; i >= 0; i--) {
          cmds.push({ indent: ind, mode, doc: doc.parts[i]! })
        }
        break
      case 'indent':
        cmds.push({ indent: ind + indentSize, mode, doc: doc.doc })
        break
      case 'dedent':
        cmds.push({ indent: Math.max(0, ind - indentSize), mode, doc: doc.doc })
        break
      case 'group':
        cmds.push({ indent: ind, mode: 'flat', doc: doc.doc })
        break
      case 'break-parent':
        break
      case 'line':
        if (doc.hard) {
          return true
        }
        if (mode === 'break') {
          return true
        }
        if (!doc.soft) {
          remaining -= 1
        }
        break
    }
  }
  return false
}

export function printDoc(doc: Doc, width = 80, indentSize = 2): string {
  const out: string[] = []
  let pos = 0
  const cmds: Cmd[] = [{ indent: 0, mode: 'break', doc }]

  while (cmds.length > 0) {
    const cmd = cmds.pop()!
    const { indent: ind, mode, doc: d } = cmd
    switch (d.kind) {
      case 'text':
        out.push(d.value)
        pos += d.value.length
        break
      case 'concat':
        for (let i = d.parts.length - 1; i >= 0; i--) {
          cmds.push({ indent: ind, mode, doc: d.parts[i]! })
        }
        break
      case 'indent':
        cmds.push({ indent: ind + indentSize, mode, doc: d.doc })
        break
      case 'dedent':
        cmds.push({ indent: Math.max(0, ind - indentSize), mode, doc: d.doc })
        break
      case 'group': {
        const flat: Cmd = { indent: ind, mode: 'flat', doc: d.doc }
        if (!mustBreak(d.doc) && fits(width - pos, flat, cmds, indentSize)) {
          cmds.push(flat)
        } else {
          cmds.push({ indent: ind, mode: 'break', doc: d.doc })
        }
        break
      }
      case 'break-parent':
        break
      case 'line':
        if (mode === 'flat' && !d.hard) {
          if (!d.soft) {
            out.push(' ')
            pos += 1
          }
        } else {
          out.push('\n' + ' '.repeat(ind))
          pos = ind
        }
        break
    }
  }
  return out.join('')
}

function mustBreak(doc: Doc): boolean {
  switch (doc.kind) {
    case 'line':
      return doc.hard
    case 'break-parent':
      return true
    case 'text':
      return false
    case 'concat':
      return doc.parts.some(mustBreak)
    case 'indent':
    case 'dedent':
    case 'group':
      return mustBreak(doc.doc)
  }
}
