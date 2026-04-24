import { StreamLanguage } from '@codemirror/language'

export const jsonataLanguage = StreamLanguage.define<{
  inString: boolean
  stringChar: string
}>({
  name: 'jsonata',
  startState: () => ({ inString: false, stringChar: '' }),
  token(stream, state) {
    if (state.inString) {
      while (!stream.eol()) {
        const ch = stream.next()
        if (ch === '\\') {
          stream.next()
        } else if (ch === state.stringChar) {
          state.inString = false
          break
        }
      }
      return 'string'
    }
    if (stream.match(/\/\*.*/)) {return 'comment'}
    const ch = stream.peek()
    if (ch === '"' || ch === "'" || ch === '`') {
      stream.next()
      state.inString = true
      state.stringChar = ch
      return 'string'
    }
    if (stream.match(/[a-zA-Z_][a-zA-Z0-9_]*/)) {
      const word = stream.current()
      if (/^(true|false|null)$/.test(word)) {return 'bool'}
      if (/^(and|or|return|function|if|then|else)$/.test(word)) {return 'keyword'}
      if (word === 'in' && /^\s/.test(stream.string.slice(stream.pos)))
        {return 'keyword'}
      return null
    }
    if (stream.match(/\$[a-zA-Z_][a-zA-Z0-9_]*/)) {
      const rest = stream.string.slice(stream.pos).match(/^\s*\(/)
      return rest ? 'builtin' : 'variableName'
    }
    if (stream.match(/[0-9]+(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?/)) {return 'number'}
    if (stream.match(/~>|:=|!=|<=|>=|\.\.|\.|\*|[=<>!+\-*/%&|?:@#^~]/))
      {return 'operator'}
    stream.next()
    return null
  },
})
