import { describe, expect, it, vi, test } from 'vitest'
import { HtmlegyExpr } from './compiler'
import type { HtmlegyProvider } from './index'

type TestNode = {
  tag: string
  text?: string
  attrs?: Record<string, string>
  children?: TestNode[]
}

function find(node: TestNode, selector: string): TestNode | null {
  if (matchesSelector(node, selector)) {
    return node
  }
  for (const child of node.children ?? []) {
    const found = find(child, selector)
    if (found) {
      return found
    }
  }
  return null
}

function findAll(node: TestNode, selector: string): TestNode[] {
  const results: TestNode[] = []
  if (matchesSelector(node, selector)) {
    results.push(node)
  }
  for (const child of node.children ?? []) {
    results.push(...findAll(child, selector))
  }
  return results
}

function matchesSelector(node: TestNode, selector: string): boolean {
  if (selector.startsWith('.')) {
    return node.attrs?.class?.split(' ').includes(selector.slice(1)) ?? false
  }
  if (selector.startsWith('#')) {
    return node.attrs?.id === selector.slice(1)
  }
  const attrMatch = selector.match(/^(\w+)?\[(\w+)(\^=|=)"([^"]+)"\]$/)
  if (attrMatch) {
    const [, tag, attr, op, val] = attrMatch
    if (tag && node.tag !== tag) {
      return false
    }
    const nodeVal = node.attrs?.[attr!] ?? ''
    return op === '^=' ? nodeVal.startsWith(val!) : nodeVal === val
  }
  return node.tag === selector
}

const provider: HtmlegyProvider<TestNode> = {
  querySelector: (node, selector) => find(node, selector),
  querySelectorAll: (node, selector) => findAll(node, selector),
  getContextHtml: (node) => `<${node.tag}>`,
  getTagName: (node) => node.tag,
  getText: (node) => node.text ?? null,
  getLines: (node) =>
    node.text != null
      ? node.text
          .split('\n')
          .map((s) => s.trim())
          .filter((s) => s.length > 0)
      : null,
  getAttribute: (node, name) => node.attrs?.[name] ?? null,
  resolveUrl: (url) => `https://example.com${url}`,
  watch: (_node, _selector, _cb) => () => {},
  await: (_node, _condition, _cb) => () => {},
  pipeOps: {
    double: (node, _args, _locale) => {
      const t = node.text
      return t ? t + t : null
    },
  },
}

function run(src: string, root: TestNode, locale?: string): unknown {
  return new HtmlegyExpr(src, provider, locale ? { locale } : {}).run(root)
}

const root: TestNode = {
  tag: 'div',
  children: [
    { tag: 'h1', text: 'Hello' },
    { tag: 'p', text: '  lots   of   space  ', attrs: { class: 'desc' } },
    {
      tag: 'ul',
      children: [
        { tag: 'li', text: 'one' },
        { tag: 'li', text: 'two' },
        { tag: 'li', text: 'three' },
      ],
    },
    { tag: 'a', attrs: { href: '/path', class: 'link' }, text: 'click' },
    { tag: 'img', attrs: { src: '/img.png', width: '100', height: '200' } },
    { tag: 'span', attrs: { 'data-id': '42', class: 'badge' }, text: '1.5k' },
  ],
}

describe('literals', () => {
  it('returns a string literal', () => {
    expect(run('"hello"', root)).toBe('hello')
  })

  it('returns a numeric literal', () => {
    expect(run('42', root)).toBe(42)
  })

  it('returns null literal', () => {
    expect(run('null', root)).toBeNull()
  })

  it('returns true', () => {
    expect(run('true', root)).toBe(true)
  })

  it('returns false', () => {
    expect(run('false', root)).toBe(false)
  })

  it('can pipe a string literal into a transform', () => {
    expect(run('"hello" | lowercase', root)).toBe('hello')
  })

  it('can pipe a number literal into a transform', () => {
    expect(run('42 | exists', root)).toBe(true)
  })
})

describe('selectors with // in strings', () => {
  it('selects an element using an attribute value containing //', () => {
    const node: TestNode = {
      tag: 'div',
      children: [
        {
          tag: 'a',
          attrs: { href: 'https://google.com/path' },
          text: 'Google',
        },
      ],
    }
    expect(run('$(a[href^="https://google.com"]) | text', node)).toBe('Google')
  })
})

describe('| text', () => {
  it('extracts text from a matched element', () => {
    expect(run('$(h1) | text', root)).toBe('Hello')
  })
})

describe('| attr', () => {
  it('extracts an attribute', () => {
    expect(run('$(a) | attr(href)', root)).toBe('/path')
  })

  it('returns null for a missing attribute on an optionally matched element', () => {
    expect(run('{ "x": $(h1)? | attr(href) }', root)).toEqual({})
  })
})

describe('| data', () => {
  it('extracts a data attribute', () => {
    expect(run('$(span) | data(id)', root)).toBe('42')
  })
})

describe('| exists', () => {
  it('returns true when element is found', () => {
    expect(run('$(h1) | exists', root)).toBe(true)
  })
})

describe('trailing commas', () => {
  it('allows a trailing comma in an object literal', () => {
    expect(run('{ "title": $(h1) | text, }', root)).toEqual({ title: 'Hello' })
  })

  it('allows a trailing comma in an array literal', () => {
    expect(run('[ $(h1) | text, $(a) | text, ]', root)).toEqual([
      'Hello',
      'click',
    ])
  })

  it('allows a trailing comma in a block', () => {
    expect(
      run('$(a) { "href": $ | attr(href), "label": $ | text, }', root),
    ).toEqual({
      href: '/path',
      label: 'click',
    })
  })
})

describe('object fields', () => {
  it('evaluates static fields', () => {
    expect(run('{ "title": $(h1) | text }', root)).toEqual({ title: 'Hello' })
  })

  it('omits fields when optional selector matches nothing', () => {
    expect(run('{ "x": $(h1) | text, "y": $(missing)? | text }', root)).toEqual(
      {
        x: 'Hello',
      },
    )
  })

  it('evaluates dynamic field keys', () => {
    expect(run('{ [$(h1) | text]: "value" }', root)).toEqual({ Hello: 'value' })
  })

  it('spreads a chain result object into the parent object', () => {
    const result = run('{ ($(a) { "href":  $ | attr(href) }) }', root)
    expect(result).toEqual({ href: '/path' })
  })
})

describe('array expressions', () => {
  it('collects multiple literal items', () => {
    expect(run('[ $(h1) | text, $(a) | text ]', root)).toEqual([
      'Hello',
      'click',
    ])
  })

  it('flattens array-valued items into the result', () => {
    const ul: TestNode = {
      tag: 'ul',
      children: [
        { tag: 'li', text: 'one' },
        { tag: 'li', text: 'two' },
      ],
    }
    const result = run('[ $$(li) { "v":  $ | text } ]', ul)
    expect(result).toEqual([{ v: 'one' }, { v: 'two' }])
  })
})

describe('$$ each selector', () => {
  it('maps a block over all matching elements', () => {
    const ul: TestNode = {
      tag: 'ul',
      children: [
        { tag: 'li', text: 'one' },
        { tag: 'li', text: 'two' },
        { tag: 'li', text: 'three' },
      ],
    }
    expect(run('$$(li) { "v":  $ | text }', ul)).toEqual([
      { v: 'one' },
      { v: 'two' },
      { v: 'three' },
    ])
  })

  it('returns an empty array when no elements match', () => {
    expect(run('$$(missing) { "v":  $ | text }', root)).toEqual([])
  })

  it('throws when requireOne (+) and no elements match', () => {
    expect(() => run('$$(missing)+ { "v":  $ | text }', root)).toThrow(
      /matched nothing/,
    )
  })
})

describe('$ single selector required', () => {
  it('throws SelectorError when required element is missing', () => {
    expect(() => run('$(missing) | text', root)).toThrow(/matched nothing/)
  })

  it('uses fallback when required selector throws', () => {
    expect(run('$(missing) | text ?? $(h1) | text', root)).toBe('Hello')
  })
})

describe('$ single selector optional', () => {
  it('omits the field when optional selector matches nothing', () => {
    expect(run('{ "x": $(missing)? | text }', root)).toEqual({})
  })

  it('uses fallback when optional result is null', () => {
    expect(run('$(missing)? | text ?? $(h1) | text', root)).toBe('Hello')
  })
})

describe('block { }', () => {
  it('evaluates fields in the context of the matched element', () => {
    expect(
      run('$(a) { "href":  $ | attr(href), "label":  $ | text }', root),
    ).toEqual({
      href: '/path',
      label: 'click',
    })
  })

  it('maps fields over each matched element', () => {
    const ul: TestNode = {
      tag: 'ul',
      children: [
        { tag: 'li', text: 'one' },
        { tag: 'li', text: 'two' },
      ],
    }
    expect(run('$$(li) { "v":  $ | text }', ul)).toEqual([
      { v: 'one' },
      { v: 'two' },
    ])
  })
})

describe('conditional ?', () => {
  it('returns then branch when truthy', () => {
    expect(run('$(h1) | text ? "yes" : "no"', root)).toBe('yes')
  })

  it('returns else branch when value is null', () => {
    expect(run('$(h1) | attr(href) ? "yes" : "no"', root)).toBe('no')
  })

  it('omits field when no else branch and value is falsy', () => {
    expect(run('{ "x": $(h1) | attr(href) ? "yes" }', root)).toEqual({})
  })
})

describe('match expression', () => {
  it('matches the first applicable single-selector arm', () => {
    expect(run('match { $(h1) =>  $ | text _ => "fallback" }', root)).toBe(
      'Hello',
    )
  })

  it('falls through to fallback when no selector arm matches', () => {
    expect(run('match { $(missing) =>  $ | text _ => "fallback" }', root)).toBe(
      'fallback',
    )
  })

  it('maps each arm over all matches', () => {
    const ul: TestNode = {
      tag: 'ul',
      children: [
        { tag: 'li', text: 'one' },
        { tag: 'li', text: 'two' },
      ],
    }
    expect(run('match { $$(li) =>  $ | text _ => null }', ul)).toEqual([
      'one',
      'two',
    ])
  })

  it('returns undefined when no arm matches and there is no fallback', () => {
    expect(run('match { $(missing) =>  $ | text }', root)).toBeUndefined()
  })
})

describe('scoped match expression', () => {
  it('resolves scoped element and passes it to fallback arm as context', () => {
    expect(run('match $(h1) { _ => $ | text }', root)).toBe('Hello')
  })

  it('returns undefined when the scoped selector matches nothing', () => {
    expect(run('match $(missing) { _ => "never" }', root)).toBeUndefined()
  })

  it('fires a call arm when the condition is truthy', () => {
    expect(
      run('match $(a) { attr($, "href") => $ | text _ => "no" }', root),
    ).toBe('click')
  })

  it('skips a call arm when the condition is null and falls through to fallback', () => {
    expect(
      run('match $(h1) { attr($, "href") => "linked" _ => "no href" }', root),
    ).toBe('no href')
  })

  it('falls through all call arms when all conditions are falsy', () => {
    expect(
      run(
        'match $(h1) { attr($, "href") => "a" attr($, "id") => "b" _ => "none" }',
        root,
      ),
    ).toBe('none')
  })

  it('returns undefined when all call arms are falsy and there is no fallback', () => {
    expect(run('match $(h1) { attr($, "href") => "a" }', root)).toBeUndefined()
  })
})

describe('match expression with scrutinee', () => {
  it('matches a literal arm by equality', () => {
    expect(
      run('match $(h1) | text { "Hello" => "yes", _ => "no" }', root),
    ).toBe('yes')
  })

  it('falls through to fallback when no literal arm matches', () => {
    expect(run('match $(h1) | text { "nope" => "yes", _ => "no" }', root)).toBe(
      'no',
    )
  })

  it('runs a pipe arm and binds $ to the piped result', () => {
    expect(
      run(
        'match $(p) | text | trim { regex("(lots)", 1) => $, _ => "nope" }',
        root,
      ),
    ).toBe('lots')
  })

  it('skips a non-matching pipe arm and tries the next one', () => {
    expect(
      run(
        'match $(p) | text | trim { regex("(zzz)", 1) => $, regex("(space)", 1) => $, _ => "nope" }',
        root,
      ),
    ).toBe('space')
  })

  it('supports a bare pipe step in arm LHS', () => {
    expect(run('match $(p) { text | trim => $, _ => "nope" }', root)).toBe(
      'lots of space',
    )
  })

  it('returns undefined when no arm matches and there is no fallback', () => {
    expect(run('match $(h1) | text { "nope" => "yes" }', root)).toBeUndefined()
  })

  it('uses the scrutinee as $ inside a literal arm body', () => {
    expect(run('match $(h1) | text { "Hello" => $ | lowercase }', root)).toBe(
      'hello',
    )
  })

  it('uses the scrutinee as $ inside the fallback body', () => {
    expect(
      run('match $(h1) | text { "nope" => "x", _ => $ | lowercase }', root),
    ).toBe('hello')
  })

  it('allows trailing comma after last arm', () => {
    expect(
      run('match $(h1) | text { "Hello" => "yes", _ => "no", }', root),
    ).toBe('yes')
  })
})

describe('pipe |number', () => {
  it('parses an integer from a data attribute', () => {
    expect(run('$(span) | data(id) | number', root)).toBe(42)
  })

  it('respects a locale kwarg for decimal parsing', () => {
    const node: TestNode = {
      tag: 'div',
      children: [{ tag: 'span', text: '1.234,56' }],
    }
    expect(run('$(span) | text | number(locale: "de")', node)).toBeCloseTo(
      1234.56,
    )
  })
})

describe('pipe |url', () => {
  it('resolves a relative URL via the provider', () => {
    expect(run('$(a) | attr(href) | url', root)).toBe(
      'https://example.com/path',
    )
  })

  it('omits the field when the attribute value is empty and the selector is optional', () => {
    const node: TestNode = {
      tag: 'div',
      children: [{ tag: 'a', attrs: { href: '' } }],
    }
    expect(run('{ "u": $(a)? | attr(href) | url }', node)).toEqual({})
  })
})

describe('pipe |expandSuffix', () => {
  it('expands a k suffix and returns a string representation', () => {
    expect(run('$(span) | text | expandSuffix', root)).toBe('1500')
  })
})

describe('pipe |regex', () => {
  it('extracts the full first match', () => {
    expect(run('$(h1) | text | regex("H\\\\w+")', root)).toBe('Hello')
  })

  it('extracts a specific capture group by index', () => {
    expect(run('$(h1) | text | regex("(H)(\\\\w+)", 2)', root)).toBe('ello')
  })

  it('omits the field when the pattern does not match and the selector is optional', () => {
    const node: TestNode = {
      tag: 'div',
      children: [{ tag: 'h1', text: 'Hello' }],
    }
    expect(run('{ "x": $(h1)? | text | regex("xyz") }', node)).toEqual({})
  })
})

describe('pipe |trim', () => {
  it('trims leading and trailing whitespace with outside', () => {
    expect(run('$(.desc) | text | trim(outside)', root)).toBe(
      'lots   of   space',
    )
  })

  it('collapses inner whitespace runs with inside', () => {
    expect(run('$(.desc) | text | trim(inside)', root)).toBe(' lots of space ')
  })

  it('trims both inner and outer whitespace by default', () => {
    expect(run('$(.desc) | text | trim', root)).toBe('lots of space')
  })
})

describe('pipe |lowercase', () => {
  it('lowercases the string', () => {
    expect(run('$(h1) | text | lowercase', root)).toBe('hello')
  })
})

describe('pipe |date', () => {
  it('parses a valid ISO date string into a Date', () => {
    const node: TestNode = {
      tag: 'div',
      children: [{ tag: 'time', text: '2024-01-15' }],
    }
    const result = run('$(time) | text | date', node)
    expect(result).toBeTypeOf('string')
    expect(new Date(result as string).getFullYear()).toBe(2024)
  })

  it('returns null for an invalid date string', () => {
    const node: TestNode = {
      tag: 'div',
      children: [{ tag: 'time', text: 'not-a-date' }],
    }
    expect(run('{ "d": $(time)? | text | date }', node)).toEqual({})
  })

  it('parses a Turkish-formatted date with locale and format kwargs', () => {
    const node: TestNode = {
      tag: 'div',
      children: [{ tag: 'time', text: '30 Mayıs 2026' }],
    }
    const result = run(
      '$(time) | text | date(locale: "tr", format: "d MMMM yyyy")',
      node,
    )
    expect(result).toBeTypeOf('string')
    expect(new Date(result as string).getFullYear()).toBe(2026)
    expect(new Date(result as string).getMonth()).toBe(4)
    expect(new Date(result as string).getDate()).toBe(30)
  })

  it('returns null when the format does not match the input', () => {
    const node: TestNode = {
      tag: 'div',
      children: [{ tag: 'time', text: 'nope' }],
    }
    expect(
      run(
        '{ "d": $(time)? | text | date(locale: "tr", format: "d MMMM yyyy") }',
        node,
      ),
    ).toEqual({})
  })
})

describe('pipe |at', () => {
  it('indexes into an array with a positive index', () => {
    const node: TestNode = {
      tag: 'td',
      text: 'Afyonkarahisar\nMerkez\nKocatepe Mah.',
    }
    expect(run('$(td) | lines | at(0)', node)).toBe('Afyonkarahisar')
    expect(run('$(td) | lines | at(1)', node)).toBe('Merkez')
    expect(run('$(td) | lines | at(2)', node)).toBe('Kocatepe Mah.')
  })

  it('returns null for an out-of-range index', () => {
    const node: TestNode = {
      tag: 'td',
      text: 'only',
    }
    expect(run('{ "v": $(td)? | lines | at(5) }', node)).toEqual({})
  })

  it('throws when applied to a non-array input', () => {
    const node: TestNode = { tag: 'td', text: 'hello' }
    expect(() => run('$(td) | text | at(0)', node)).toThrow(/must be an array/)
  })
})

describe('pipe |merge', () => {
  it('merges an array of objects into a single object', () => {
    const ul: TestNode = {
      tag: 'ul',
      children: [
        { tag: 'li', attrs: { class: 'a' }, text: 'first' },
        { tag: 'li', attrs: { class: 'b' }, text: 'second' },
      ],
    }
    const result = run(
      '$$(li) { [$(li) | attr(class)]:  $ | text } | merge',
      ul,
    )
    expect(result).toEqual({ a: 'first', b: 'second' })
  })
})

describe('provider pipeOps', () => {
  it('delegates to a provider-defined pipe op', () => {
    expect(run('$(h1) | double', root)).toBe('HelloHello')
  })

  it('throws for an unknown pipe op not present in built-ins or provider', () => {
    expect(() => run('$(h1) | unknownOp', root)).toThrow(
      'unknown pipe function: unknownOp',
    )
  })
})

describe('built-ins take precedence over provider pipeOps', () => {
  it('uses built-in trim even when provider defines a trim op', () => {
    const overridingProvider: HtmlegyProvider<TestNode> = {
      ...provider,
      pipeOps: { trim: () => 'OVERRIDDEN' },
    }
    const expr = new HtmlegyExpr('$(.desc) | text | trim', overridingProvider)
    expect(expr.run(root)).toBe('lots of space')
  })
})

describe('scoped expr .()', () => {
  it('evaluates expression with matched element as context', () => {
    expect(run('$(ul).($(li) | text)', root)).toBe('one')
  })
})

describe('alias @name on $$', () => {
  it('exposes the alias in the block scope', () => {
    const ul: TestNode = {
      tag: 'ul',
      attrs: { id: 'list' },
      children: [
        { tag: 'li', text: 'one' },
        { tag: 'li', text: 'two' },
      ],
    }
    expect(run('@root$$(li) { "v":  $ | text }', ul)).toEqual([
      { v: 'one' },
      { v: 'two' },
    ])
  })
})

describe('root ref @', () => {
  it('references the root node passed to run()', () => {
    const node: TestNode = { tag: 'div', attrs: { class: 'container' } }
    expect(run('{ "c": @ | attr(class) }', node)).toEqual({ c: 'container' })
  })
})

describe('context ref $', () => {
  it('evaluates to the current element', () => {
    expect(run(' $ | text', { tag: 'span', text: 'hi' })).toBe('hi')
  })
})

describe('onElement callback', () => {
  it('is called once per matched single selector', () => {
    const onElement = vi.fn()
    const expr = new HtmlegyExpr(
      '{ "title": $(h1) | text, "link": $(a) | attr(href) }',
      provider,
      { onElement },
    )
    expr.run(root)
    expect(onElement).toHaveBeenCalledTimes(2)
  })

  it('receives the field label path from the enclosing object', () => {
    const calls: string[][] = []
    const expr = new HtmlegyExpr('{ "title": $(h1) | text }', provider, {
      onElement: (_node, label) => calls.push(label.field),
    })
    expr.run(root)
    expect(calls).toEqual([['title']])
  })
})

describe('function call syntax', () => {
  it('text(x) is equivalent to x | text', () => {
    expect(run('text($(h1))', root)).toBe('Hello')
  })

  it('attr(x, name) is equivalent to x | attr(name)', () => {
    expect(run('attr($(a), href)', root)).toBe('/path')
  })

  it('can chain further pipe ops after a function call', () => {
    expect(run('text($(h1)) | lowercase', root)).toBe('hello')
  })

  it('can nest function calls', () => {
    expect(run('lowercase(text($(h1)))', root)).toBe('hello')
  })

  it('number(x) works with kwargs', () => {
    const node: TestNode = {
      tag: 'div',
      children: [{ tag: 'span', text: '1.234,56' }],
    }
    expect(run('number(text($(span)), locale: "de")', node)).toBeCloseTo(
      1234.56,
    )
  })
})

describe('zip(a, b, ...)', () => {
  const table: TestNode = {
    tag: 'table',
    attrs: { id: 't' },
    children: [
      {
        tag: 'thead',
        children: [
          {
            tag: 'tr',
            children: [
              { tag: 'td', text: 'Make', attrs: { class: 'h' } },
              { tag: 'td', text: 'Model', attrs: { class: 'h' } },
              { tag: 'td', text: 'Year', attrs: { class: 'h' } },
            ],
          },
        ],
      },
      {
        tag: 'tbody',
        children: [
          {
            tag: 'tr',
            attrs: { class: 'row' },
            children: [
              { tag: 'td', text: 'Audi', attrs: { class: 'c' } },
              { tag: 'td', text: 'A5', attrs: { class: 'c' } },
              { tag: 'td', text: '2024', attrs: { class: 'c' } },
            ],
          },
          {
            tag: 'tr',
            attrs: { class: 'row' },
            children: [
              { tag: 'td', text: 'Tesla', attrs: { class: 'c' } },
              { tag: 'td', text: 'Model Y', attrs: { class: 'c' } },
              { tag: 'td', text: '2023', attrs: { class: 'c' } },
            ],
          },
        ],
      },
    ],
  }

  it('zips two lane lists by index, binding $1 and $2 in the block', () => {
    expect(
      run('zip($$(.h), $$(.c)) { [$1 | text]:  $2 | text }', table),
    ).toEqual([{ Make: 'Audi' }, { Model: 'A5' }, { Year: '2024' }])
  })

  it('produces attribute maps per row when nested under each-row iteration', () => {
    expect(
      run(
        '$$(.row) { "attrs": zip(@.($$(.h)), $$(.c)) { [$1 | text]: $2 | text } | merge }',
        table,
      ),
    ).toEqual([
      { attrs: { Make: 'Audi', Model: 'A5', Year: '2024' } },
      { attrs: { Make: 'Tesla', Model: 'Model Y', Year: '2023' } },
    ])
  })

  it('truncates to the shortest lane', () => {
    const short: TestNode = {
      tag: 'div',
      children: [
        { tag: 'span', text: 'a', attrs: { class: 'k' } },
        { tag: 'span', text: 'b', attrs: { class: 'k' } },
        { tag: 'span', text: 'c', attrs: { class: 'k' } },
        { tag: 'span', text: '1', attrs: { class: 'v' } },
        { tag: 'span', text: '2', attrs: { class: 'v' } },
      ],
    }
    expect(
      run('zip($$(.k), $$(.v)) { [$1 | text]:  $2 | text }', short),
    ).toEqual([{ a: '1' }, { b: '2' }])
  })

  it('supports three or more lanes', () => {
    const triple: TestNode = {
      tag: 'div',
      children: [
        { tag: 'span', text: 'x', attrs: { class: 'k' } },
        { tag: 'span', text: 'y', attrs: { class: 'k' } },
        { tag: 'span', text: '1', attrs: { class: 'v' } },
        { tag: 'span', text: '2', attrs: { class: 'v' } },
        { tag: 'span', text: 'A', attrs: { class: 'u' } },
        { tag: 'span', text: 'B', attrs: { class: 'u' } },
      ],
    }
    expect(
      run(
        'zip($$(.k), $$(.v), $$(.u)) { "k":  $1 | text, "v":  $2 | text, "u":  $3 | text }',
        triple,
      ),
    ).toEqual([
      { k: 'x', v: '1', u: 'A' },
      { k: 'y', v: '2', u: 'B' },
    ])
  })

  it('returns an empty array when any lane is empty', () => {
    expect(
      run('zip($$(.k), $$(.missing)) { [$1 | text]:  $2 | text }', {
        tag: 'div',
        children: [{ tag: 'span', text: 'a', attrs: { class: 'k' } }],
      }),
    ).toEqual([])
  })
})

describe('isReactive', () => {
  it('returns false for a static expression', () => {
    expect(new HtmlegyExpr('$(h1) | text', provider).isReactive).toBe(false)
  })

  it('throws when calling reactive() on a non-reactive expression', () => {
    expect(() =>
      new HtmlegyExpr('$(h1) | text', provider).reactive(root),
    ).toThrow()
  })
})

const node: TestNode = {
  tag: 'div',
  attrs: {
    text: 'https://test.com/in/hi',
  },
  children: [{ tag: 'span', text: '1.234,56' }],
}

test('must be able to extract url from attributes', () => {
  expect(
    run('$(div) | attr(text) | regex("https://test.com/in/(.+)", 1)', node),
  ).toBe('hi')
})

describe('root selectors @$(…) and @$$(…)', () => {
  const table: TestNode = {
    tag: 'div',
    children: [
      {
        tag: 'tr',
        attrs: { class: 'row' },
        children: [
          { tag: 'th', text: 'Make', attrs: { class: 'h' } },
          { tag: 'th', text: 'Model', attrs: { class: 'h' } },
          { tag: 'th', text: 'Year', attrs: { class: 'h' } },
          { tag: 'th', text: 'Games', attrs: { class: 'c' } },
        ],
      },
      {
        tag: 'tr',
        attrs: { class: 'row' },
        children: [
          { tag: 'td', text: 'Audi', attrs: { class: 'c' } },
          { tag: 'td', text: 'A5', attrs: { class: 'c' } },
          { tag: 'td', text: '2024', attrs: { class: 'c' } },
        ],
      },
    ],
  }

  it('@$$(sel) selects from root inside a nested scope', () => {
    expect(
      run(
        '$$(.row) { "attrs": zip(@$$(.h), $$(.c)) { [$1 | text]: $2 | text } | merge }',
        table,
      ),
    ).toEqual([
      { attrs: { Make: 'Games' } },
      { attrs: { Make: 'Audi', Model: 'A5', Year: '2024' } },
    ])
  })

  it('@$(sel) selects a single match from root inside a nested scope', () => {
    expect(run('$$(.row) { "first": @$(.h) | text }', table)).toEqual([
      { first: 'Make' },
      { first: 'Make' },
    ])
  })

  it('@$$(sel) at top level behaves like $$(sel)', () => {
    expect(run('@$$(.h) { "v": $ | text }', table)).toEqual([
      { v: 'Make' },
      { v: 'Model' },
      { v: 'Year' },
    ])
  })
})

describe('alias bind-or-use', () => {
  const tree: TestNode = {
    tag: 'div',
    attrs: { id: 'outer' },
    children: [
      {
        tag: 'ul',
        children: [
          { tag: 'li', text: 'one' },
          { tag: 'li', text: 'two' },
        ],
      },
    ],
  }

  it('binds the alias the first time and reuses it on subsequent occurrences', () => {
    expect(
      run(
        '@outer$(ul) { "list": $$(li) { "v": $ | text, "outerId": @outer | attr(id) } }',
        tree,
      ),
    ).toEqual({
      list: [
        { v: 'one', outerId: 'outer' },
        { v: 'two', outerId: 'outer' },
      ],
    })
  })

  it('@name$(sel) re-uses an already-bound alias as scope', () => {
    expect(
      run(
        '@outer$(ul) { "again": @outer$(ul) | attr(class) ?? "noclass", "items": @outer$$(li) { "v": $ | text } }',
        tree,
      ),
    ).toEqual({
      again: 'noclass',
      items: [{ v: 'one' }, { v: 'two' }],
    })
  })
})

describe('| money', () => {
  const usd: TestNode = {
    tag: 'div',
    children: [{ tag: 'span', attrs: { class: 'price' }, text: '$1,234.56' }],
  }

  const tl: TestNode = {
    tag: 'div',
    children: [
      { tag: 'span', attrs: { class: 'price' }, text: '1.234,56 TL' },
      { tag: 'span', attrs: { class: 'code' }, text: 'TRY' },
    ],
  }

  const jpy: TestNode = {
    tag: 'div',
    children: [{ tag: 'span', attrs: { class: 'price' }, text: '¥4980' }],
  }

  it('infers currency from a leading symbol', () => {
    expect(run('$(.price) | text | money', usd)).toEqual({
      _type: 'money',
      amount: 1234.56,
      currency: 'USD',
    })
  })

  it('infers currency from a JPY symbol with zero decimals', () => {
    expect(run('$(.price) | text | money', jpy)).toEqual({
      _type: 'money',
      amount: 4980,
      currency: 'JPY',
    })
  })

  it('accepts an explicit currency literal kwarg', () => {
    expect(run("$(.price) | text | money(currency: 'TRY')", tl, 'tr')).toEqual({
      _type: 'money',
      amount: 1234.56,
      currency: 'TRY',
    })
  })

  it('resolves an expression-valued currency kwarg', () => {
    expect(
      run('$(.price) | text | money(currency: $(.code) | text)', tl, 'tr'),
    ).toEqual({
      _type: 'money',
      amount: 1234.56,
      currency: 'TRY',
    })
  })

  it('returns null when text is empty', () => {
    expect(run("'' | money(currency: 'USD')", usd)).toBeNull()
  })

  it('throws when no currency can be inferred and none is given', () => {
    const node: TestNode = {
      tag: 'div',
      children: [{ tag: 'span', attrs: { class: 'price' }, text: '49.99' }],
    }
    expect(() => run('$(.price) | text | money', node)).toThrow(/currency/)
  })

  it('defaults locale to html[lang] when no kwarg is given', () => {
    const node: TestNode = {
      tag: 'html',
      attrs: { lang: 'tr' },
      children: [{ tag: 'span', attrs: { class: 'price' }, text: '$ 51.000 ' }],
    }
    expect(run('$(.price) | text | money', node)).toEqual({
      _type: 'money',
      amount: 51000,
      currency: 'USD',
    })
  })
})
