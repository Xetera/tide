import { describe, expect, it, vi } from 'vitest'
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
  return node.tag === selector
}

const provider: HtmlegyProvider<TestNode> = {
  querySelector: (node, selector) => find(node, selector),
  querySelectorAll: (node, selector) => findAll(node, selector),
  getContextHtml: (node) => `<${node.tag}>`,
  getTagName: (node) => node.tag,
  getText: (node) => node.text ?? null,
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
    expect(run('[ $(h1) | text, $(a) | text, ]', root)).toEqual(['Hello', 'click'])
  })

  it('allows a trailing comma in a block', () => {
    expect(run('$(a) { "href": $ | attr(href), "label": $ | text, }', root)).toEqual({
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
    expect(run('{ "x": $(h1) | text, "y": $(missing)? | text }', root)).toEqual({
      x: 'Hello',
    })
  })

  it('evaluates dynamic field keys', () => {
    expect(run('{ [$(h1) | text]: "value" }', root)).toEqual({ Hello: 'value' })
  })

  it('spreads a pipeline result object into the parent object', () => {
    const result = run('{ ($(a) { "href":  $ | attr(href) }) }', root)
    expect(result).toEqual({ href: '/path' })
  })
})

describe('array expressions', () => {
  it('collects multiple literal items', () => {
    expect(run('[ $(h1) | text, $(a) | text ]', root)).toEqual(['Hello', 'click'])
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

  it('uses fallback pipeline when required selector throws', () => {
    expect(run('$(missing) | text ?? $(h1) | text', root)).toBe('Hello')
  })
})

describe('$ single selector optional', () => {
  it('omits the field when optional selector matches nothing', () => {
    expect(run('{ "x": $(missing)? | text }', root)).toEqual({})
  })

  it('uses fallback pipeline when optional result is null', () => {
    expect(run('$(missing)? | text ?? $(h1) | text', root)).toBe('Hello')
  })
})

describe('block { }', () => {
  it('evaluates fields in the context of the matched element', () => {
    expect(run('$(a) { "href":  $ | attr(href), "label":  $ | text }', root)).toEqual(
      {
        href: '/path',
        label: 'click',
      },
    )
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
    expect(run('match { $(h1) =>  $ | text _ => "fallback" }', root)).toBe('Hello')
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
    expect(run('$(a) | attr(href) | url', root)).toBe('https://example.com/path')
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
    expect(run('$(.desc) | text | trim(outside)', root)).toBe('lots   of   space')
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
    expect(result).toBeInstanceOf(Date)
    expect((result as Date).getFullYear()).toBe(2024)
  })

  it('returns null for an invalid date string', () => {
    const node: TestNode = {
      tag: 'div',
      children: [{ tag: 'time', text: 'not-a-date' }],
    }
    expect(run('{ "d": $(time)? | text | date }', node)).toEqual({})
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
    const result = run('$$(li) { [$(li) | attr(class)]:  $ | text } | merge', ul)
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
