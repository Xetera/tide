import { describe, expect, it, vi } from 'vitest'
import { compile } from '~/htmlevate/compiler'

function dom(html: string): Document {
  const doc = document.implementation.createHTMLDocument()
  doc.body.innerHTML = html
  return doc
}

function run(expr: string, html: string) {
  return compile(expr)(dom(html).body)
}

describe('text', () => {
  it('extracts text content', () => {
    expect(run('{ "v": $(h1):text }', '<h1>hello</h1>')).toEqual({ v: 'hello' })
  })
})

describe('attr', () => {
  it('extracts an attribute', () => {
    expect(run('{ "v": $(a):attr(href) }', '<a href="/foo">x</a>')).toEqual({ v: '/foo' })
  })
})

describe('data', () => {
  it('extracts a data attribute', () => {
    expect(run('{ "v": $(div):data(age) | number }', '<div data-age="42"></div>')).toEqual({ v: 42 })
  })
})

describe('exists', () => {
  it('returns true when element is present', () => {
    expect(run('{ "v": $([aria-label=Verified]):exists }', '<span aria-label="Verified"></span>')).toEqual({ v: true })
  })

  it('returns false when element is absent', () => {
    expect(run('{ "v": $([aria-label=Verified]):exists }', '<div></div>')).toEqual({ v: false })
  })
})

describe('url', () => {
  it('resolves a relative url', () => {
    const result = run('{ "v": $(a):attr(href) | url }', '<a href="/foo">x</a>')
    expect((result as any).v).toMatch(/\/foo$/)
  })
})

describe('number', () => {
  it('casts a string to a number', () => {
    expect(run('{ "v": $(span):text | number }', '<span>123</span>')).toEqual({ v: 123 })
  })

  it('parses turkish formatted numbers using compile-time locale', () => {
    const result = compile('{ "v": $(span):text | number }', { locale: 'tr' })(
      dom('<span>1.234,56</span>').body
    )
    expect(result).toEqual({ v: 1234.56 })
  })

  it('parses turkish formatted numbers using inline locale kwarg', () => {
    expect(run('{ "v": $(span):text | number(locale: \'tr\') }', '<span>1.234,56</span>')).toEqual({ v: 1234.56 })
  })
})

describe('expandSuffix', () => {
  it('expands K suffix', () => {
    expect(run('{ "v": $(span):text | expandSuffix | number }', '<span>1.5K</span>')).toEqual({ v: 1500 })
  })

  it('expands M suffix', () => {
    expect(run('{ "v": $(span):text | expandSuffix | number }', '<span>2M</span>')).toEqual({ v: 2000000 })
  })
})

describe('regex', () => {
  it('extracts full match', () => {
    expect(run('{ "v": $(span):text | regex("[0-9]+") }', '<span>abc 42 def</span>')).toEqual({ v: '42' })
  })

  it('extracts a capture group', () => {
    expect(run('{ "v": $(span):text | regex("(.+) TL", 1) | number }', '<span>1,250 TL</span>')).toEqual({ v: 1250 })
  })
})

describe('trim', () => {
  it('trims outside whitespace', () => {
    expect(run('{ "v": $(span):text | trim(outside) }', '<span>  hello  </span>')).toEqual({ v: 'hello' })
  })

  it('collapses inside whitespace', () => {
    expect(run('{ "v": $(span):text | trim(inside) }', '<span>hello   world</span>')).toEqual({ v: 'hello world' })
  })
})

describe('date', () => {
  it('parses a datetime attribute', () => {
    const result = run('{ "v": $(time):attr(datetime) | date }', '<time datetime="2024-06-15T12:00:00Z"></time>')
    expect((result as any).v).toBeInstanceOf(Date)
  })
})

describe('media', () => {
  it('extracts url from an img element', () => {
    const result = run('{ "v": $(img) | media }', '<img src="https://example.com/photo.jpg" />')
    expect((result as any).v).toMatchObject({ url: 'https://example.com/photo.jpg' })
  })

  it('includes dimensions when present as attributes', () => {
    const result = run('{ "v": $(img) | media }', '<img src="https://example.com/photo.jpg" width="640" height="480" />')
    expect((result as any).v).toMatchObject({ dimensions: { width: 640, height: 480 } })
  })

  it('extracts url from a video element', () => {
    const result = run('{ "v": $(video) | media }', '<video src="https://example.com/clip.mp4"></video>')
    expect((result as any).v).toMatchObject({ url: 'https://example.com/clip.mp4' })
  })
})

describe('nested fields', () => {
  it('descends into a child context', () => {
    const html = '<div class="loc"><span>Istanbul</span><a href="/map">map</a></div>'
    const result = run('{ "location": $(.loc) { "name": $(span):text } }', html)
    expect(result).toEqual({ location: { name: 'Istanbul' } })
  })
})

describe('$$', () => {
  it('produces an array', () => {
    const html = '<ul><li><p>Homer</p></li><li><p>Bart</p></li></ul>'
    const result = run('{ "names": $$(ul > li) { "name": $(p):text } }', html)
    expect(result).toEqual({ names: [{ name: 'Homer' }, { name: 'Bart' }] })
  })
})

describe('merge', () => {
  it('merges array of objects into one', () => {
    const html = '<ul><li><p>Homer</p><span>42</span></li><li><p>Bart</p><span>10</span></li></ul>'
    const result = run('{ "users": $$(ul > li) { [$(p):text]: $(span):text | number } | merge }', html)
    expect(result).toEqual({ users: { Homer: 42, Bart: 10 } })
  })
})

describe('omit with ?', () => {
  it('omits the key when element is missing', () => {
    const result = run('{ "v": $(.missing)? :text }', '<div></div>')
    expect(result).not.toHaveProperty('v')
  })

  it('includes the key when element is present', () => {
    const result = run('{ "v": $(.present)? :text }', '<div class="present">hi</div>')
    expect(result).toHaveProperty('v', 'hi')
  })
})

describe('?? selector fallback', () => {
  it('uses first matching selector', () => {
    const html = '<span class="a">42K</span>'
    const result = run('{ "v": $(.a) ?? $(.b) :text | expandSuffix | number }', html)
    expect(result).toEqual({ v: 42000 })
  })

  it('falls back to second selector when first is absent', () => {
    const html = '<span class="b">42K</span>'
    const result = run('{ "v": $(.a) ?? $(.b) :text | expandSuffix | number }', html)
    expect(result).toEqual({ v: 42000 })
  })

  it('applies the pipeline once to whichever matched', () => {
    const html = '<span class="b">1.2M</span>'
    const result = run('{ "v": $(.a) ?? $(.b) :text | expandSuffix | number }', html)
    expect(result).toEqual({ v: 1200000 })
  })
})

describe('match', () => {
  it('uses the first matching branch', () => {
    const html = '<video src="blob:x"></video>'
    const result = run(
      '{ "media": match { $(video[src^=blob]) => { "type": "video" } $([role=presentation]) => { "type": "carousel" } } }',
      html,
    )
    expect(result).toEqual({ media: { type: 'video' } })
  })

  it('skips non-matching branches', () => {
    const html = '<ul role="presentation"><li></li></ul>'
    const result = run(
      '{ "media": match { $(video[src^=blob]) => { "type": "video" } $([role=presentation]) => { "type": "carousel" } } }',
      html,
    )
    expect(result).toEqual({ media: { type: 'carousel' } })
  })

  it('falls back to last arm when nothing matches', () => {
    const html = '<div></div>'
    const result = run(
      '{ "count": match { $(span.enabled) => { "tag": "count_enabled" } _ => { "tag": "count_disabled" } } }',
      html,
    )
    expect(result).toEqual({ count: { tag: 'count_disabled' } })
  })

  it('match with scalar branch result', () => {
    const html = '<span aria-label="Carousel"></span>'
    const result = run(
      '{ "kind": match { $([aria-label=Carousel]) => "carousel" $([aria-label=Clip]) => "clip" _ => null } }',
      html,
    )
    expect(result).toEqual({ kind: 'carousel' })
  })
})

describe('alias @', () => {
  it('allows referencing an ancestor element from a nested $$ block', () => {
    const html = '<ul><li data-list-id="42"><a href="/posts/1">First</a><a href="/posts/2">Second</a></li></ul>'
    const result = run(
      '{ "links": @row $$(ul > li) { "items": $$(a) { "href": $:attr(href), "listId": @row:data(list-id) } } }',
      html,
    )
    expect(result).toEqual({
      links: [{ items: [{ href: '/posts/1', listId: '42' }, { href: '/posts/2', listId: '42' }] }],
    })
  })
})

describe('conditional ?', () => {
  it('returns true branch when condition is truthy', () => {
    expect(run('{ "v": $(p):text ? "yes" : "no" }', '<p>hello</p>')).toEqual({ v: 'yes' })
  })

  it('returns false branch when condition is falsy', () => {
    expect(run('{ "v": $(p):text ? "yes" : "no" }', '<div></div>')).toEqual({ v: 'no' })
  })

  it('omits key when single-arm conditional has no match', () => {
    const result = run('{ "v": $(p):text ? "yes" }', '<div></div>')
    expect(result).not.toHaveProperty('v')
  })
})

describe('watch', () => {
  it('parses and exposes reactive interface', () => {
    const compiled = compile('watch $$(li) { "v": $:text }')
    expect(compiled.reactive).toBeDefined()
  })

  it('emits initial value on subscribe', () => {
    const doc = dom('<ul><li>a</li><li>b</li></ul>')
    const reactive = compile('watch $$(li) { "v": $:text }').reactive!(doc.body)
    const cb = vi.fn()
    reactive.subscribe(cb)
    expect(cb).toHaveBeenCalledWith([{ v: 'a' }, { v: 'b' }])
  })

  it('re-emits when DOM mutates', async () => {
    const doc = dom('<ul><li>a</li></ul>')
    const reactive = compile('watch $$(ul > li) { "v": $:text }').reactive!(doc.body)
    const cb = vi.fn()
    reactive.subscribe(cb)

    const li = doc.createElement('li')
    li.textContent = 'b'
    doc.body.querySelector('ul')!.appendChild(li)

    await new Promise(r => setTimeout(r, 0))
    expect(cb).toHaveBeenLastCalledWith([{ v: 'a' }, { v: 'b' }])
  })

  it('re-emits with alias referencing parent element', async () => {
    const doc = dom('<ul><li data-id="1"><a href="/a">x</a></li></ul>')
    const reactive = compile('watch @row $$(ul > li) { "id": @row:data(id), "link": $(a):attr(href) }').reactive!(doc.body)
    const cb = vi.fn()
    reactive.subscribe(cb)

    expect(cb).toHaveBeenCalledWith([{ id: '1', link: '/a' }])

    const li = doc.createElement('li')
    li.setAttribute('data-id', '2')
    const a = doc.createElement('a')
    a.setAttribute('href', '/b')
    a.textContent = 'y'
    li.appendChild(a)
    doc.body.querySelector('ul')!.appendChild(li)

    await new Promise(r => setTimeout(r, 0))
    expect(cb).toHaveBeenLastCalledWith([{ id: '1', link: '/a' }, { id: '2', link: '/b' }])
  })

  it('batches simultaneous appends and removals into one emission', async () => {
    const doc = dom('<ul><li>a</li><li>b</li><li>c</li></ul>')
    const reactive = compile('watch $$(ul > li) { "v": $:text }').reactive!(doc.body)
    const cb = vi.fn()
    reactive.subscribe(cb)

    const ul = doc.body.querySelector('ul')!
    ul.removeChild(ul.firstElementChild!)
    ul.removeChild(ul.firstElementChild!)
    const d = doc.createElement('li'); d.textContent = 'd'; ul.appendChild(d)
    const e = doc.createElement('li'); e.textContent = 'e'; ul.appendChild(e)

    await new Promise(r => setTimeout(r, 0))
    expect(cb).toHaveBeenCalledTimes(2)
    expect(cb).toHaveBeenLastCalledWith([{ v: 'c' }, { v: 'd' }, { v: 'e' }])
  })

  it('unsubscribe stops further emissions', async () => {
    const doc = dom('<ul><li>a</li></ul>')
    const reactive = compile('watch $$(ul > li) { "v": $:text }').reactive!(doc.body)
    const cb = vi.fn()
    const unsub = reactive.subscribe(cb)
    unsub()

    const li = doc.createElement('li')
    li.textContent = 'b'
    doc.body.querySelector('ul')!.appendChild(li)

    await new Promise(r => setTimeout(r, 0))
    expect(cb).toHaveBeenCalledTimes(1)
  })
})

describe('await', () => {
  it('parses and exposes reactive interface', () => {
    const compiled = compile('await $$(li) { "v": $:text }')
    expect(compiled.reactive).toBeDefined()
  })

  it('evaluates immediately when condition already exists (self-await)', () => {
    const doc = dom('<ul><li>a</li></ul>')
    const reactive = compile('await $$(li) { "v": $:text }').reactive!(doc.body)
    const cb = vi.fn()
    reactive.subscribe(cb)
    expect(cb).toHaveBeenCalledWith([{ v: 'a' }])
  })

  it('waits for sentinel condition before evaluating', async () => {
    const doc = dom('<div id="loading"></div>')
    const reactive = compile('await(#ready) $$(li) { "v": $:text }').reactive!(doc.body)
    const cb = vi.fn()
    reactive.subscribe(cb)

    expect(cb).not.toHaveBeenCalled()

    const ready = doc.createElement('div')
    ready.id = 'ready'
    doc.body.appendChild(ready)

    const li = doc.createElement('li')
    li.textContent = 'x'
    doc.body.appendChild(li)

    await new Promise(r => setTimeout(r, 0))
    expect(cb).toHaveBeenCalledWith([{ v: 'x' }])
  })

  it('resolves only once (not on subsequent mutations)', async () => {
    const doc = dom('')
    const reactive = compile('await(#ready) $$(li) { "v": $:text }').reactive!(doc.body)
    const cb = vi.fn()
    reactive.subscribe(cb)

    const ready = doc.createElement('div')
    ready.id = 'ready'
    doc.body.appendChild(ready)

    await new Promise(r => setTimeout(r, 0))
    expect(cb).toHaveBeenCalledTimes(1)

    doc.body.appendChild(doc.createElement('li'))
    await new Promise(r => setTimeout(r, 0))
    expect(cb).toHaveBeenCalledTimes(1)
  })
})

describe('expression field', () => {
  it('merges fields into parent object', () => {
    expect(run(
      '{ "a": $(h1):text, ($(div) { "b": $(span):text }) }',
      '<h1>hello</h1><div><span>world</span></div>'
    )).toEqual({ a: 'hello', b: 'world' })
  })

  it('contributes zero keys when selector is missing', () => {
    expect(run(
      '{ "a": $(h1):text, ($(#missing) { "b": $:text }) }',
      '<h1>hello</h1>'
    )).toEqual({ a: 'hello' })
  })

  it('contributes zero keys with omit selector', () => {
    expect(run(
      '{ "a": $(h1):text, ($(#missing)? { "b": $:text }) }',
      '<h1>hello</h1>'
    )).toEqual({ a: 'hello' })
  })

  it('coexists with dynamic and static fields', () => {
    expect(run(
      '{ "x": $(h1):text, ($(div) { "y": $(span):text }), [$(h2):text]: $(p):text }',
      '<h1>a</h1><div><span>b</span></div><h2>key</h2><p>val</p>'
    )).toEqual({ x: 'a', y: 'b', key: 'val' })
  })
})

describe('root ref @', () => {
  it('refers to the top-level root element', () => {
    expect(run('{ "v": @.($(h1):text) }', '<h1>hello</h1>')).toEqual({ v: 'hello' })
  })

  it('escapes iteration context inside $$ block', () => {
    expect(run(
      '{ "items": $$(li) { "li": $:text, "h1": @.($(h1):text) } }',
      '<h1>title</h1><ul><li>a</li><li>b</li></ul>'
    )).toEqual({ items: [{ li: 'a', h1: 'title' }, { li: 'b', h1: 'title' }] })
  })
})

describe('scoped expression .( )', () => {
  it('evaluates inner expr with current element as context', () => {
    expect(run(
      '{ "v": $(div).($(.inner):text) }',
      '<div><span class="inner">hello</span></div>'
    )).toEqual({ v: 'hello' })
  })

  it('re-scopes into a nested element', () => {
    expect(run(
      '{ "v": $(div).( $(span):text ) }',
      '<div><span>hello</span></div>'
    )).toEqual({ v: 'hello' })
  })

  it('returns null when source is null', () => {
    expect(run(
      '{ "v": $(#missing).($:text) }',
      '<div>x</div>'
    )).toEqual({ v: null })
  })
})
