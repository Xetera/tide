import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createExpr } from './index'

function dom(html: string): Document {
  const doc = document.implementation.createHTMLDocument()
  doc.body.innerHTML = html
  return doc
}

function run(expr: string, html: string) {
  return createExpr(expr).run(dom(html).body)
}

describe('text', () => {
  it('extracts text content', () => {
    expect(run('{ "v": $(h1) | text }', '<h1>hello</h1>')).toEqual({
      v: 'hello',
    })
  })
})

describe('attr', () => {
  it('extracts an attribute', () => {
    expect(run('{ "v": $(a) | attr(href) }', '<a href="/foo">x</a>')).toEqual({
      v: '/foo',
    })
  })
})

describe('data', () => {
  it('extracts a data attribute', () => {
    expect(
      run('{ "v": $(div) | data(age) | number }', '<div data-age="42"></div>'),
    ).toEqual({ v: 42 })
  })
})

describe('exists', () => {
  it('returns true when element is present', () => {
    expect(
      run(
        '{ "v": $([aria-label=Verified]) | exists }',
        '<span aria-label="Verified"></span>',
      ),
    ).toEqual({ v: true })
  })

  it('returns false when element is absent', () => {
    expect(
      run('{ "v": $([aria-label=Verified]) | exists }', '<div></div>'),
    ).toEqual({ v: false })
  })
})

describe('url', () => {
  it('resolves a relative url', () => {
    const result = run(
      '{ "v": $(a) | attr(href) | url }',
      '<a href="/foo">x</a>',
    )
    expect((result as any).v).toMatch(/\/foo$/)
  })
})

describe('number', () => {
  it('casts a string to a number', () => {
    expect(run('{ "v": $(span) | text | number }', '<span>123</span>')).toEqual(
      {
        v: 123,
      },
    )
  })

  it('parses turkish formatted numbers using compile-time locale', () => {
    const result = createExpr('{ "v": $(span) | text | number }', {
      locale: 'tr',
    }).run(dom('<span>1.234,56</span>').body)
    expect(result).toEqual({ v: 1234.56 })
  })

  it('parses turkish formatted numbers using inline locale kwarg', () => {
    expect(
      run(
        '{ "v": $(span) | text | number(locale: \'tr\') }',
        '<span>1.234,56</span>',
      ),
    ).toEqual({ v: 1234.56 })
  })
})

describe('expandSuffix', () => {
  it('expands K suffix', () => {
    expect(
      run(
        '{ "v": $(span) | text | expandSuffix | number }',
        '<span>1.5K</span>',
      ),
    ).toEqual({ v: 1500 })
  })

  it('expands M suffix', () => {
    expect(
      run('{ "v": $(span) | text | expandSuffix | number }', '<span>2M</span>'),
    ).toEqual({ v: 2000000 })
  })
})

describe('number locale suffix expansion', () => {
  const tr = (expr: string, html: string) =>
    createExpr(expr, { locale: 'tr' }).run(dom(html).body)

  describe('en', () => {
    it('expands k', () => {
      expect(
        run('{ "v": $(span) | text | number }', '<span>1.5k</span>'),
      ).toEqual({ v: 1500 })
    })

    it('expands K', () => {
      expect(
        run('{ "v": $(span) | text | number }', '<span>42K</span>'),
      ).toEqual({ v: 42000 })
    })

    it('expands m', () => {
      expect(
        run('{ "v": $(span) | text | number }', '<span>2m</span>'),
      ).toEqual({
        v: 2000000,
      })
    })

    it('expands b', () => {
      expect(
        run('{ "v": $(span) | text | number }', '<span>1b</span>'),
      ).toEqual({
        v: 1000000000,
      })
    })

    it('does not expand tr suffixes', () => {
      expect(
        run('{ "v": $(span) | text | number }', '<span>100 bin</span>'),
      ).toEqual({ v: 100 })
    })
  })

  describe('tr', () => {
    it('expands bin', () => {
      expect(
        tr('{ "v": $(span) | text | number }', '<span>100 bin</span>'),
      ).toEqual({ v: 100000 })
    })

    it('expands B as bin', () => {
      expect(
        tr('{ "v": $(span) | text | number }', '<span>2,5 B</span>'),
      ).toEqual({ v: 2500 })
    })

    it('expands milyon', () => {
      expect(
        tr('{ "v": $(span) | text | number }', '<span>1,5 milyon</span>'),
      ).toEqual({ v: 1500000 })
    })

    it('expands mn', () => {
      expect(
        tr('{ "v": $(span) | text | number }', '<span>3 mn</span>'),
      ).toEqual({ v: 3000000 })
    })

    it('expands milyar', () => {
      expect(
        tr('{ "v": $(span) | text | number }', '<span>2 milyar</span>'),
      ).toEqual({ v: 2000000000 })
    })

    it('expands mr', () => {
      expect(
        tr('{ "v": $(span) | text | number }', '<span>1 mr</span>'),
      ).toEqual({ v: 1000000000 })
    })

    it('does not expand en suffixes', () => {
      expect(tr('{ "v": $(span) | text | number }', '<span>1b</span>')).toEqual(
        {
          v: 1000,
        },
      )
    })

    it('handles decimal with Turkish formatting', () => {
      expect(
        tr(
          '{ "v": $(span) | text | number(locale: \'tr\') }',
          '<span>1.234 bin</span>',
        ),
      ).toEqual({ v: 1234000 })
    })
  })
})

describe('regex', () => {
  it('extracts full match', () => {
    expect(
      run(
        '{ "v": $(span) | text | regex("[0-9]+") }',
        '<span>abc 42 def</span>',
      ),
    ).toEqual({ v: '42' })
  })

  it('extracts a capture group', () => {
    expect(
      run(
        '{ "v": $(span) | text | regex("(.+) TL", 1) | number }',
        '<span>1,250 TL</span>',
      ),
    ).toEqual({ v: 1250 })
  })
})

describe('trim', () => {
  it('trims outside whitespace', () => {
    expect(
      run('{ "v": $(span) | text | trim(outside) }', '<span>  hello  </span>'),
    ).toEqual({ v: 'hello' })
  })

  it('collapses inside whitespace', () => {
    expect(
      run(
        '{ "v": $(span) | text | trim(inside) }',
        '<span>hello   world</span>',
      ),
    ).toEqual({ v: 'hello world' })
  })
})

describe('date', () => {
  it('parses a datetime attribute', () => {
    const result = run(
      '{ "v": $(time) | attr(datetime) | date }',
      '<time datetime="2024-06-15T12:00:00Z"></time>',
    )
    expect((result as any).v).toBeInstanceOf(Date)
  })
})

describe('media', () => {
  it('extracts url from an img element', () => {
    const result = run(
      '{ "v": $(img) | media }',
      '<img src="https://example.com/photo.jpg" />',
    )
    expect((result as any).v).toMatchObject({
      url: 'https://example.com/photo.jpg',
    })
  })

  it('includes dimensions when present as attributes', () => {
    const result = run(
      '{ "v": $(img) | media }',
      '<img src="https://example.com/photo.jpg" width="640" height="480" />',
    )
    expect((result as any).v).toMatchObject({
      dimensions: { width: 640, height: 480 },
    })
  })

  it('extracts url from a video element', () => {
    const result = run(
      '{ "v": $(video) | media }',
      '<video src="https://example.com/clip.mp4"></video>',
    )
    expect((result as any).v).toMatchObject({
      url: 'https://example.com/clip.mp4',
    })
  })
})

describe('nested fields', () => {
  it('descends into a child context', () => {
    const html =
      '<div class="loc"><span>Istanbul</span><a href="/map">map</a></div>'
    const result = run(
      '{ "location": $(.loc) { "name": $(span) | text } }',
      html,
    )
    expect(result).toEqual({ location: { name: 'Istanbul' } })
  })
})

describe('$$', () => {
  it('produces an array', () => {
    const html = '<ul><li><p>Homer</p></li><li><p>Bart</p></li></ul>'
    const result = run('{ "names": $$(ul > li) { "name": $(p) | text } }', html)
    expect(result).toEqual({ names: [{ name: 'Homer' }, { name: 'Bart' }] })
  })

  it('returns empty array when no elements match', () => {
    expect(
      run('{ "names": $$(li) { "name": $ | text } }', '<div></div>'),
    ).toEqual({ names: [] })
  })

  it('throws when + selector matches nothing', () => {
    expect(() =>
      run('{ "names": $$(li)+ { "name": $ | text } }', '<div></div>'),
    ).toThrow()
  })

  it('does not throw when + selector matches at least one element', () => {
    expect(() =>
      run('{ "names": $$(li)+ { "name": $ | text } }', '<ul><li>a</li></ul>'),
    ).not.toThrow()
  })
})

describe('required single selector', () => {
  it('throws when a required selector matches nothing', () => {
    expect(() => run('{ "v": $(h1) | text }', '<div></div>')).toThrow(
      '$(h1) matched nothing',
    )
  })

  it('does not throw when required selector matches', () => {
    expect(() => run('{ "v": $(h1) | text }', '<h1>hello</h1>')).not.toThrow()
  })

  it('uses fallback when required primary selector misses', () => {
    expect(
      run('{ "v": $(h1) | text ?? $(h2) | text }', '<h2>fallback</h2>'),
    ).toEqual({ v: 'fallback' })
  })
})

describe('merge', () => {
  it('merges array of objects into one', () => {
    const html =
      '<ul><li><p>Homer</p><span>42</span></li><li><p>Bart</p><span>10</span></li></ul>'
    const result = run(
      '{ "users": $$(ul > li) { [$(p) | text]: $(span) | text | number } | merge }',
      html,
    )
    expect(result).toEqual({ users: { Homer: 42, Bart: 10 } })
  })
})

describe('omit with ?', () => {
  it('omits the key when element is missing', () => {
    const result = run('{ "v": $(.missing)? | text }', '<div></div>')
    expect(result).not.toHaveProperty('v')
  })

  it('includes the key when element is present', () => {
    const result = run(
      '{ "v": $(.present)? | text }',
      '<div class="present">hi</div>',
    )
    expect(result).toHaveProperty('v', 'hi')
  })
})

describe('?? selector fallback', () => {
  it('uses first matching selector', () => {
    const html = '<span class="a">42K</span>'
    const result = run(
      '{ "v": $(.a) | text | expandSuffix | number ?? $(.b) | text | expandSuffix | number }',
      html,
    )
    expect(result).toEqual({ v: 42000 })
  })

  it('falls back to second selector when first is absent', () => {
    const html = '<span class="b">42K</span>'
    const result = run(
      '{ "v": $(.a) | text | expandSuffix | number ?? $(.b) | text | expandSuffix | number }',
      html,
    )
    expect(result).toEqual({ v: 42000 })
  })

  it('applies the pipeline once to whichever matched', () => {
    const html = '<span class="b">1.2M</span>'
    const result = run(
      '{ "v": $(.a) | text | expandSuffix | number ?? $(.b) | text | expandSuffix | number }',
      html,
    )
    expect(result).toEqual({ v: 1200000 })
  })

  it('does not apply post-fallback transforms when primary already produced a value', () => {
    const html =
      '<span class="a" data-id="123"></span><span class="b">456</span>'
    const result = run('{ "v": $(.a) | data(id) ?? $(.b) | text }', html)
    expect(result).toEqual({ v: '123' })
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
    const html =
      '<ul><li data-list-id="42"><a href="/posts/1">First</a><a href="/posts/2">Second</a></li></ul>'
    const result = run(
      '{ "links": @row $$(ul > li) { "items": $$(a) { "href": $ | attr(href), "listId": @row | data(list-id) } } }',
      html,
    )
    expect(result).toEqual({
      links: [
        {
          items: [
            { href: '/posts/1', listId: '42' },
            { href: '/posts/2', listId: '42' },
          ],
        },
      ],
    })
  })
})

describe('conditional ?', () => {
  it('returns true branch when condition is truthy', () => {
    expect(run('{ "v": $(p) | text ? "yes" : "no" }', '<p>hello</p>')).toEqual({
      v: 'yes',
    })
  })

  it('returns false branch when condition is falsy', () => {
    expect(run('{ "v": $(p) | text ? "yes" : "no" }', '<div></div>')).toEqual({
      v: 'no',
    })
  })

  it('omits key when single-arm conditional has no match', () => {
    const result = run('{ "v": $(p) | text ? "yes" }', '<div></div>')
    expect(result).not.toHaveProperty('v')
  })
})

describe('watch', () => {
  beforeEach(() => { vi.useFakeTimers() })
  afterEach(() => { vi.useRealTimers() })

  it('exposes reactive interface', () => {
    const expr = createExpr('watch $$(li) { "v": $ | text }')
    expect(expr.isReactive).toBe(true)
  })

  it('emits initial value on subscribe', () => {
    const doc = dom('<ul><li>a</li><li>b</li></ul>')
    const reactive = createExpr('watch $$(li) { "v": $ | text }').reactive(
      doc.body,
    )
    const cb = vi.fn()
    reactive.subscribe(cb)
    expect(cb).toHaveBeenCalledWith([{ v: 'a' }, { v: 'b' }])
  })

  it('re-emits when DOM mutates', async () => {
    const doc = dom('<ul><li>a</li></ul>')
    const reactive = createExpr('watch $$(ul > li) { "v": $ | text }').reactive(
      doc.body,
    )
    const cb = vi.fn()
    reactive.subscribe(cb)

    const li = doc.createElement('li')
    li.textContent = 'b'
    doc.body.querySelector('ul')!.appendChild(li)

    await vi.runAllTimersAsync()
    expect(cb).toHaveBeenLastCalledWith([{ v: 'a' }, { v: 'b' }])
  })

  it('re-emits with alias referencing parent element', async () => {
    const doc = dom('<ul><li data-id="1"><a href="/a">x</a></li></ul>')
    const reactive = createExpr(
      'watch @row $$(ul > li) { "id": @row | data(id), "link": $(a) | attr(href) }',
    ).reactive(doc.body)
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

    await vi.runAllTimersAsync()
    expect(cb).toHaveBeenLastCalledWith([
      { id: '1', link: '/a' },
      { id: '2', link: '/b' },
    ])
  })

  it('batches simultaneous appends and removals into one emission', async () => {
    const doc = dom('<ul><li>a</li><li>b</li><li>c</li></ul>')
    const reactive = createExpr('watch $$(ul > li) { "v": $ | text }').reactive(
      doc.body,
    )
    const cb = vi.fn()
    reactive.subscribe(cb)

    const ul = doc.body.querySelector('ul')!
    ul.removeChild(ul.firstElementChild!)
    ul.removeChild(ul.firstElementChild!)
    const d = doc.createElement('li')
    d.textContent = 'd'
    ul.appendChild(d)
    const e = doc.createElement('li')
    e.textContent = 'e'
    ul.appendChild(e)

    await vi.runAllTimersAsync()
    expect(cb).toHaveBeenCalledTimes(2)
    expect(cb).toHaveBeenLastCalledWith([{ v: 'c' }, { v: 'd' }, { v: 'e' }])
  })

  it('unsubscribe stops further emissions', async () => {
    const doc = dom('<ul><li>a</li></ul>')
    const reactive = createExpr('watch $$(ul > li) { "v": $ | text }').reactive(
      doc.body,
    )
    const cb = vi.fn()
    const unsub = reactive.subscribe(cb)
    unsub()

    const li = doc.createElement('li')
    li.textContent = 'b'
    doc.body.querySelector('ul')!.appendChild(li)

    await vi.runAllTimersAsync()
    expect(cb).toHaveBeenCalledTimes(1)
  })

  it('re-emits when text content of a matched element changes', async () => {
    const doc = dom('<ul><li>a</li></ul>')
    const reactive = createExpr('watch $$(ul > li) { "v": $ | text }').reactive(
      doc.body,
    )
    const cb = vi.fn()
    reactive.subscribe(cb)

    doc.body.querySelector('li')!.textContent = 'changed'

    await vi.runAllTimersAsync()
    expect(cb).toHaveBeenLastCalledWith([{ v: 'changed' }])
  })

  it('re-emits when a matched element attribute changes', async () => {
    const doc = dom('<ul><li data-val="x">a</li></ul>')
    const reactive = createExpr(
      'watch $$(ul > li) { "v": $ | data(val) }',
    ).reactive(doc.body)
    const cb = vi.fn()
    reactive.subscribe(cb)

    doc.body.querySelector('li')!.setAttribute('data-val', 'y')

    await vi.runAllTimersAsync()
    expect(cb).toHaveBeenLastCalledWith([{ v: 'y' }])
  })

  it('get() returns the last emitted value', async () => {
    const doc = dom('<ul><li>a</li></ul>')
    const reactive = createExpr('watch $$(ul > li) { "v": $ | text }').reactive(
      doc.body,
    )
    reactive.subscribe(() => {})
    expect(reactive.get()).toEqual([{ v: 'a' }])

    const li = doc.createElement('li')
    li.textContent = 'b'
    doc.body.querySelector('ul')!.appendChild(li)

    await vi.runAllTimersAsync()
    expect(reactive.get()).toEqual([{ v: 'a' }, { v: 'b' }])
  })

  it('notifies all active subscribers independently', async () => {
    const doc = dom('<ul><li>a</li></ul>')
    const reactive = createExpr('watch $$(ul > li) { "v": $ | text }').reactive(
      doc.body,
    )
    const cb1 = vi.fn()
    const cb2 = vi.fn()
    reactive.subscribe(cb1)
    reactive.subscribe(cb2)

    const li = doc.createElement('li')
    li.textContent = 'b'
    doc.body.querySelector('ul')!.appendChild(li)

    await vi.runAllTimersAsync()
    expect(cb1).toHaveBeenLastCalledWith([{ v: 'a' }, { v: 'b' }])
    expect(cb2).toHaveBeenLastCalledWith([{ v: 'a' }, { v: 'b' }])
  })

  it('resumes observation after all subscribers resubscribe', async () => {
    const doc = dom('<ul><li>a</li></ul>')
    const reactive = createExpr('watch $$(ul > li) { "v": $ | text }').reactive(
      doc.body,
    )
    const cb = vi.fn()
    const unsub = reactive.subscribe(cb)
    unsub()

    const cb2 = vi.fn()
    reactive.subscribe(cb2)
    expect(cb2).toHaveBeenCalledWith([{ v: 'a' }])

    const li = doc.createElement('li')
    li.textContent = 'b'
    doc.body.querySelector('ul')!.appendChild(li)

    await vi.runAllTimersAsync()
    expect(cb2).toHaveBeenLastCalledWith([{ v: 'a' }, { v: 'b' }])
    expect(cb).toHaveBeenCalledTimes(1)
  })

  it('re-emits when the observed parent is replaced with a new node containing new children', async () => {
    const doc = dom('<div id="wrap"><ul><li>a</li></ul></div>')
    const reactive = createExpr('watch $$(ul > li) { "v": $ | text }').reactive(
      doc.body,
    )
    const cb = vi.fn()
    reactive.subscribe(cb)

    const newWrap = doc.createElement('div')
    newWrap.id = 'wrap'
    const newUl = doc.createElement('ul')
    const newLi = doc.createElement('li')
    newLi.textContent = 'b'
    newUl.appendChild(newLi)
    newWrap.appendChild(newUl)
    doc.body.replaceChild(newWrap, doc.body.querySelector('#wrap')!)

    await vi.runAllTimersAsync()
    expect(cb).toHaveBeenLastCalledWith([{ v: 'b' }])
  })

  it('re-emits after observed parent node is removed and re-added', async () => {
    const doc = dom('<div id="wrap"><ul><li>a</li></ul></div>')
    const reactive = createExpr('watch $$(ul > li) { "v": $ | text }').reactive(
      doc.body,
    )
    const cb = vi.fn()
    reactive.subscribe(cb)

    const wrap = doc.body.querySelector('#wrap')!
    doc.body.removeChild(wrap)
    doc.body.appendChild(wrap)

    const li = doc.createElement('li')
    li.textContent = 'b'
    wrap.querySelector('ul')!.appendChild(li)

    await vi.runAllTimersAsync()
    expect(cb).toHaveBeenLastCalledWith([{ v: 'a' }, { v: 'b' }])
  })

  it('re-emits after selector target parent is removed and re-added', async () => {
    const doc = dom('<div id="wrap"><ul id="list"><li>a</li></ul></div>')
    const reactive = createExpr(
      'watch $$(#list > li) { "v": $ | text }',
    ).reactive(doc.body)
    const cb = vi.fn()
    reactive.subscribe(cb)

    const list = doc.body.querySelector('#list')!
    const wrap = doc.body.querySelector('#wrap')!
    wrap.removeChild(list)
    wrap.appendChild(list)

    const li = doc.createElement('li')
    li.textContent = 'b'
    list.appendChild(li)

    await vi.runAllTimersAsync()
    expect(cb).toHaveBeenLastCalledWith([{ v: 'a' }, { v: 'b' }])
  })

  it('watch on a single $ selector re-emits on child DOM mutation', async () => {
    const doc = dom('<div><span>hello</span></div>')
    const reactive = createExpr(
      'watch $(div) { "v": $(span) | text }',
    ).reactive(doc.body)
    const cb = vi.fn()
    reactive.subscribe(cb)

    expect(cb).toHaveBeenCalledWith({ v: 'hello' })

    doc.body.querySelector('span')!.textContent = 'world'

    await vi.runAllTimersAsync()
    expect(cb).toHaveBeenLastCalledWith({ v: 'world' })
  })

  it('re-emits after all page content is removed and re-added', async () => {
    const doc = dom('<div><ul><li>a</li><li>b</li></ul></div>')
    const reactive = createExpr(
      '$(div) { "test": watch $$(ul > li) { "v": $ | text } }',
    ).reactive(doc.body)
    const cb = vi.fn()
    reactive.subscribe(cb)

    expect(cb).toHaveBeenCalledWith({ test: [{ v: 'a' }, { v: 'b' }] })

    const div = doc.body.querySelector('div')!
    doc.body.removeChild(div)

    const newDiv = doc.createElement('div')
    const newUl = doc.createElement('ul')
    const liA = doc.createElement('li')
    liA.textContent = 'a'
    const liB = doc.createElement('li')
    liB.textContent = 'b'
    newUl.appendChild(liA)
    newUl.appendChild(liB)
    newDiv.appendChild(newUl)
    doc.body.appendChild(newDiv)

    await vi.runAllTimersAsync()
    expect(cb).toHaveBeenCalledTimes(2)
    expect(cb).toHaveBeenLastCalledWith({
      test: [{ v: 'a' }, { v: 'b' }],
    })
  })

  it('does not re-emit when a DOM mutation produces structurally identical output', async () => {
    const doc = dom('<ul><li>a</li></ul>')
    const reactive = createExpr('watch $$(ul > li) { "v": $ | text }').reactive(
      doc.body,
    )
    const cb = vi.fn()
    let lastSerialized: string | null = null
    reactive.subscribe((value) => {
      const serialized = JSON.stringify(value)
      if (serialized === lastSerialized) return
      lastSerialized = serialized
      cb(value)
    })

    expect(cb).toHaveBeenCalledTimes(1)

    const ul = doc.body.querySelector('ul')!
    const existing = ul.querySelector('li')!
    ul.removeChild(existing)
    const replacement = doc.createElement('li')
    replacement.textContent = 'a'
    ul.appendChild(replacement)

    await vi.runAllTimersAsync()
    expect(cb).toHaveBeenCalledTimes(1)
  })
})

describe('await', () => {
  it('exposes reactive interface', () => {
    const expr = createExpr('await $$(li) { "v": $ | text }')
    expect(expr.isReactive).toBe(true)
  })

  it('evaluates immediately when condition already exists (self-await)', () => {
    const doc = dom('<ul><li>a</li></ul>')
    const reactive = createExpr('await $$(li) { "v": $ | text }').reactive(
      doc.body,
    )
    const cb = vi.fn()
    reactive.subscribe(cb)
    expect(cb).toHaveBeenCalledWith([{ v: 'a' }])
  })

  it('waits for sentinel condition before evaluating', async () => {
    const doc = dom('<div id="loading"></div>')
    const reactive = createExpr(
      'await(#ready) $$(li) { "v": $ | text }',
    ).reactive(doc.body)
    const cb = vi.fn()
    reactive.subscribe(cb)

    expect(cb).not.toHaveBeenCalled()

    const ready = doc.createElement('div')
    ready.id = 'ready'
    doc.body.appendChild(ready)

    const li = doc.createElement('li')
    li.textContent = 'x'
    doc.body.appendChild(li)

    await new Promise((r) => setTimeout(r, 0))
    expect(cb).toHaveBeenCalledWith([{ v: 'x' }])
  })

  it('await watch: waits for first li > .item to appear, then tracks subsequent additions', async () => {
    vi.useFakeTimers()
    const doc = dom('<div id="app"></div>')
    const reactive = createExpr(
      'await watch $$(li > .item)+ { "v": $ | text }',
    ).reactive(doc.body)
    const cb = vi.fn()
    reactive.subscribe(cb)

    expect(cb).not.toHaveBeenCalled()

    const ul = doc.createElement('ul')
    const li = doc.createElement('li')
    const item = doc.createElement('span')
    item.className = 'item'
    item.textContent = 'first'
    li.appendChild(item)
    ul.appendChild(li)
    doc.body.querySelector('#app')!.appendChild(ul)

    await vi.runAllTimersAsync()
    expect(cb).toHaveBeenCalledWith([{ v: 'first' }])

    const li2 = doc.createElement('li')
    const item2 = doc.createElement('span')
    item2.className = 'item'
    item2.textContent = 'second'
    li2.appendChild(item2)
    ul.appendChild(li2)

    await vi.runAllTimersAsync()
    expect(cb).toHaveBeenLastCalledWith([{ v: 'first' }, { v: 'second' }])
    vi.useRealTimers()
  })

  it('resolves only once (not on subsequent mutations)', async () => {
    const doc = dom('')
    const reactive = createExpr(
      'await(#ready) $$(li) { "v": $ | text }',
    ).reactive(doc.body)
    const cb = vi.fn()
    reactive.subscribe(cb)

    const ready = doc.createElement('div')
    ready.id = 'ready'
    doc.body.appendChild(ready)

    await new Promise((r) => setTimeout(r, 0))
    expect(cb).toHaveBeenCalledTimes(1)

    doc.body.appendChild(doc.createElement('li'))
    await new Promise((r) => setTimeout(r, 0))
    expect(cb).toHaveBeenCalledTimes(1)
  })
})

describe('expression field', () => {
  it('merges fields into parent object', () => {
    expect(
      run(
        '{ "a": $(h1) | text, ($(div) { "b": $(span) | text }) }',
        '<h1>hello</h1><div><span>world</span></div>',
      ),
    ).toEqual({ a: 'hello', b: 'world' })
  })

  it('contributes zero keys when selector is missing', () => {
    expect(
      run(
        '{ "a": $(h1) | text, ($(#missing) { "b": $ | text }) }',
        '<h1>hello</h1>',
      ),
    ).toEqual({ a: 'hello' })
  })

  it('contributes zero keys with omit selector', () => {
    expect(
      run(
        '{ "a": $(h1) | text, ($(#missing)? { "b": $ | text }) }',
        '<h1>hello</h1>',
      ),
    ).toEqual({ a: 'hello' })
  })

  it('coexists with dynamic and static fields', () => {
    expect(
      run(
        '{ "x": $(h1) | text, ($(div) { "y": $(span) | text }), [$(h2) | text]: $(p) | text }',
        '<h1>a</h1><div><span>b</span></div><h2>key</h2><p>val</p>',
      ),
    ).toEqual({ x: 'a', y: 'b', key: 'val' })
  })
})

describe('root ref @', () => {
  it('refers to the top-level root element', () => {
    expect(run('{ "v": @.($(h1) | text) }', '<h1>hello</h1>')).toEqual({
      v: 'hello',
    })
  })

  it('escapes iteration context inside $$ block', () => {
    expect(
      run(
        '{ "items": $$(li) { "li": $ | text, "h1": @.($(h1) | text) } }',
        '<h1>title</h1><ul><li>a</li><li>b</li></ul>',
      ),
    ).toEqual({
      items: [
        { li: 'a', h1: 'title' },
        { li: 'b', h1: 'title' },
      ],
    })
  })
})

describe('scoped expression .( )', () => {
  it('evaluates inner expr with current element as context', () => {
    expect(
      run(
        '{ "v": $(div).($(.inner) | text) }',
        '<div><span class="inner">hello</span></div>',
      ),
    ).toEqual({ v: 'hello' })
  })

  it('re-scopes into a nested element', () => {
    expect(
      run(
        '{ "v": $(div).( $(span) | text ) }',
        '<div><span>hello</span></div>',
      ),
    ).toEqual({ v: 'hello' })
  })

  it('returns null when source is null', () => {
    expect(run('{ "v": $(#missing).($ | text) }', '<div>x</div>')).toEqual({
      v: null,
    })
  })
})

describe('onElement highlight callback', () => {
  function runWithHighlights(expr: string, html: string) {
    const doc = dom(html)
    const highlights: {
      element: Element
      label: { field: string[] }
      isArrayItem: boolean
    }[] = []
    createExpr(expr, {
      onElement: (element, label, isArrayItem) => {
        highlights.push({ element, label, isArrayItem })
      },
    }).run(doc.body)
    return { doc, highlights }
  }

  it('fires for a single selector with the field label', () => {
    const { doc, highlights } = runWithHighlights(
      '{ "title": $(h1) | text }',
      '<h1>hello</h1>',
    )
    expect(highlights).toHaveLength(1)
    expect(highlights[0]!.element).toBe(doc.body.querySelector('h1'))
    expect(highlights[0]!.label).toEqual({ field: ['title'] })
    expect(highlights[0]!.isArrayItem).toBe(false)
  })

  it('fires for fields inside an each block with isArrayItem true', () => {
    const { doc, highlights } = runWithHighlights(
      '{ "items": $$(li) { "name": $(span) | text } }',
      '<ul><li><span>a</span></li><li><span>b</span></li></ul>',
    )
    const spans = Array.from(doc.body.querySelectorAll('span'))
    expect(highlights).toHaveLength(2)
    expect(highlights.map((h) => h.element)).toEqual(spans)
    expect(highlights.every((h) => h.isArrayItem)).toBe(false)
    expect(highlights.every((h) => h.label.field.at(-1) === 'name')).toBe(true)
  })

  it('uses dotted path label for nested fields', () => {
    const { doc, highlights } = runWithHighlights(
      '{ "author": $(div) { "name": $(span) | text } }',
      '<div><span>Alice</span></div>',
    )
    const div = doc.body.querySelector('div')!
    const span = doc.body.querySelector('span')!
    expect(highlights[0]!.element).toBe(div)
    expect(highlights[0]!.label).toEqual({ field: ['author'] })
    expect(highlights[1]!.element).toBe(span)
    expect(highlights[1]!.label).toEqual({ field: ['author', 'name'] })
  })

  it('throws when a required selector matches nothing', () => {
    expect(() =>
      runWithHighlights('{ "v": $(#missing) | text }', '<div>x</div>'),
    ).toThrow('$(#missing) matched nothing')
  })

  it('fires for the fallback selector when primary misses', () => {
    const { doc, highlights } = runWithHighlights(
      '{ "v": $(#missing) ?? $(h1) }',
      '<h1>hello</h1>',
    )
    expect(highlights).toHaveLength(1)
    expect(highlights[0]!.element).toBe(doc.body.querySelector('h1'))
    expect(highlights[0]!.isArrayItem).toBe(false)
  })

  it('does not fire when onElement is not provided', () => {
    expect(() =>
      createExpr('{ "v": $(h1) | text }').run(dom('<h1>x</h1>').body),
    ).not.toThrow()
  })
})

describe('ref', () => {
  it('wraps a value in a ref object', () => {
    expect(
      run('$(span) | data(id) | ref', '<span data-id="42"></span>'),
    ).toEqual({ _type: 'ref', _id: '42' })
  })

  it('returns null when value is null', () => {
    expect(run('"x" | ref', '<div></div>')).toEqual({ _type: 'ref', _id: 'x' })
  })
})
