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
  it('extracts text content', async () => {
    expect(await run('{ "v": $(h1) | text }', '<h1>hello</h1>')).toEqual({
      v: 'hello',
    })
  })
})

describe('textContent', () => {
  it('returns raw textContent including no separator for br', async () => {
    expect(
      await run(
        '{ "v": $(td) | textContent }',
        '<table><tr><td>İstanbul<br>Pendik</td></tr></table>',
      ),
    ).toEqual({ v: 'İstanbulPendik' })
  })
})

describe('innerText', () => {
  it('falls back to textContent when innerText is unavailable', async () => {
    expect(
      await run(
        '{ "v": $(td) | innerText }',
        '<table><tr><td>İstanbul<br>Pendik</td></tr></table>',
      ),
    ).toBeDefined()
  })
})

describe('lines', () => {
  it('splits on br into an array of segments', async () => {
    expect(
      await run(
        '{ "v": $(td) | lines }',
        '<table><tr><td>İstanbul<br>Pendik</td></tr></table>',
      ),
    ).toEqual({ v: ['İstanbul', 'Pendik'] })
  })

  it('splits on block-level children', async () => {
    expect(
      await run(
        '{ "v": $(div) | lines }',
        '<div><p>one</p><p>two</p></div>',
      ),
    ).toEqual({ v: ['one', 'two'] })
  })
})

describe('attr', () => {
  it('extracts an attribute', async () => {
    expect(await run('{ "v": $(a) | attr(href) }', '<a href="/foo">x</a>')).toEqual({
      v: '/foo',
    })
  })
})

describe('data', () => {
  it('extracts a data attribute', async () => {
    expect(
      await run('{ "v": $(div) | data(age) | number }', '<div data-age="42"></div>'),
    ).toEqual({ v: 42 })
  })
})

describe('exists', () => {
  it('returns true when element is present', async () => {
    expect(
      await run(
        '{ "v": $([aria-label=Verified]) | exists }',
        '<span aria-label="Verified"></span>',
      ),
    ).toEqual({ v: true })
  })

  it('returns false when element is absent', async () => {
    expect(
      await run('{ "v": $([aria-label=Verified]) | exists }', '<div></div>'),
    ).toEqual({ v: false })
  })
})

describe('url', () => {
  it('resolves a relative url', async () => {
    const result = await run(
      '{ "v": $(a) | attr(href) | url }',
      '<a href="/foo">x</a>',
    )
    expect((result as any).v).toMatch(/\/foo$/)
  })
})

describe('number', () => {
  it('casts a string to a number', async () => {
    expect(await run('{ "v": $(span) | text | number }', '<span>123</span>')).toEqual(
      {
        v: 123,
      },
    )
  })

  it('parses turkish formatted numbers using compile-time locale', async () => {
    const result = await createExpr('{ "v": $(span) | text | number }', {
      locale: 'tr',
    }).run(dom('<span>1.234,56</span>').body)
    expect(result).toEqual({ v: 1234.56 })
  })

  it('parses turkish formatted numbers using inline locale kwarg', async () => {
    expect(
      await run(
        '{ "v": $(span) | text | number(locale: \'tr\') }',
        '<span>1.234,56</span>',
      ),
    ).toEqual({ v: 1234.56 })
  })
})

describe('expandSuffix', () => {
  it('expands K suffix', async () => {
    expect(
      await run(
        '{ "v": $(span) | text | expandSuffix | number }',
        '<span>1.5K</span>',
      ),
    ).toEqual({ v: 1500 })
  })

  it('expands M suffix', async () => {
    expect(
      await run('{ "v": $(span) | text | expandSuffix | number }', '<span>2M</span>'),
    ).toEqual({ v: 2000000 })
  })
})

describe('number locale suffix expansion', () => {
  const tr = (expr: string, html: string) =>
    createExpr(expr, { locale: 'tr' }).run(dom(html).body)

  describe('en', () => {
    it('expands k', async () => {
      expect(
        await run('{ "v": $(span) | text | number }', '<span>1.5k</span>'),
      ).toEqual({ v: 1500 })
    })

    it('expands K', async () => {
      expect(
        await run('{ "v": $(span) | text | number }', '<span>42K</span>'),
      ).toEqual({ v: 42000 })
    })

    it('expands m', async () => {
      expect(
        await run('{ "v": $(span) | text | number }', '<span>2m</span>'),
      ).toEqual({
        v: 2000000,
      })
    })

    it('expands b', async () => {
      expect(
        await run('{ "v": $(span) | text | number }', '<span>1b</span>'),
      ).toEqual({
        v: 1000000000,
      })
    })

    it('does not expand tr suffixes', async () => {
      expect(
        await run('{ "v": $(span) | text | number }', '<span>100 bin</span>'),
      ).toEqual({ v: 100 })
    })
  })

  describe('tr', () => {
    it('expands bin', async () => {
      expect(
        await tr('{ "v": $(span) | text | number }', '<span>100 bin</span>'),
      ).toEqual({ v: 100000 })
    })

    it('expands B as bin', async () => {
      expect(
        await tr('{ "v": $(span) | text | number }', '<span>2,5 B</span>'),
      ).toEqual({ v: 2500 })
    })

    it('expands milyon', async () => {
      expect(
        await tr('{ "v": $(span) | text | number }', '<span>1,5 milyon</span>'),
      ).toEqual({ v: 1500000 })
    })

    it('expands mn', async () => {
      expect(
        await tr('{ "v": $(span) | text | number }', '<span>3 mn</span>'),
      ).toEqual({ v: 3000000 })
    })

    it('expands milyar', async () => {
      expect(
        await tr('{ "v": $(span) | text | number }', '<span>2 milyar</span>'),
      ).toEqual({ v: 2000000000 })
    })

    it('expands mr', async () => {
      expect(
        await tr('{ "v": $(span) | text | number }', '<span>1 mr</span>'),
      ).toEqual({ v: 1000000000 })
    })

    it('does not expand en suffixes', async () => {
      expect(await tr('{ "v": $(span) | text | number }', '<span>1b</span>')).toEqual(
        {
          v: 1000,
        },
      )
    })

    it('handles decimal with Turkish formatting', async () => {
      expect(
        await tr(
          '{ "v": $(span) | text | number(locale: \'tr\') }',
          '<span>1.234 bin</span>',
        ),
      ).toEqual({ v: 1234000 })
    })
  })
})

describe('regex', () => {
  it('extracts full match', async () => {
    expect(
      await run(
        '{ "v": $(span) | text | regex("[0-9]+") }',
        '<span>abc 42 def</span>',
      ),
    ).toEqual({ v: '42' })
  })

  it('extracts a capture group', async () => {
    expect(
      await run(
        '{ "v": $(span) | text | regex("(.+) TL", 1) | number }',
        '<span>1,250 TL</span>',
      ),
    ).toEqual({ v: 1250 })
  })
})

describe('trim', () => {
  it('trims outside whitespace', async () => {
    expect(
      await run('{ "v": $(span) | text | trim(outside) }', '<span>  hello  </span>'),
    ).toEqual({ v: 'hello' })
  })

  it('collapses inside whitespace', async () => {
    expect(
      await run(
        '{ "v": $(span) | text | trim(inside) }',
        '<span>hello   world</span>',
      ),
    ).toEqual({ v: 'hello world' })
  })
})

describe('date', () => {
  it('parses a datetime attribute', async () => {
    const result = await run(
      '{ "v": $(time) | attr(datetime) | date }',
      '<time datetime="2024-06-15T12:00:00Z"></time>',
    )
    expect((result as any).v).toBe('2024-06-15T12:00:00.000Z')
  })
})

describe('media', () => {
  it('extracts url from an img element', async () => {
    const result = await run(
      '{ "v": $(img) | media }',
      '<img src="https://example.com/photo.jpg" />',
    )
    expect((result as any).v).toMatchObject({
      url: 'https://example.com/photo.jpg',
    })
  })

  it('includes dimensions when present as attributes', async () => {
    const result = await run(
      '{ "v": $(img) | media }',
      '<img src="https://example.com/photo.jpg" width="640" height="480" />',
    )
    expect((result as any).v).toMatchObject({
      dimensions: { width: 640, height: 480 },
    })
  })

  it('extracts url from a video element', async () => {
    const result = await run(
      '{ "v": $(video) | media }',
      '<video src="https://example.com/clip.mp4"></video>',
    )
    expect((result as any).v).toMatchObject({
      url: 'https://example.com/clip.mp4',
    })
  })
})

describe('nested fields', () => {
  it('descends into a child context', async () => {
    const html =
      '<div class="loc"><span>Istanbul</span><a href="/map">map</a></div>'
    const result = await run(
      '{ "location": $(.loc) { "name": $(span) | text } }',
      html,
    )
    expect(result).toEqual({ location: { name: 'Istanbul' } })
  })
})

describe('$$', () => {
  it('produces an array', async () => {
    const html = '<ul><li><p>Homer</p></li><li><p>Bart</p></li></ul>'
    const result = await run('{ "names": $$(ul > li) { "name": $(p) | text } }', html)
    expect(result).toEqual({ names: [{ name: 'Homer' }, { name: 'Bart' }] })
  })

  it('returns empty array when no elements match', async () => {
    expect(
      await run('{ "names": $$(li) { "name": $ | text } }', '<div></div>'),
    ).toEqual({ names: [] })
  })

  it('throws when + selector matches nothing', async () => {
    await expect(
      run('{ "names": $$(li)+ { "name": $ | text } }', '<div></div>'),
    ).rejects.toThrow()
  })

  it('does not throw when + selector matches at least one element', async () => {
    await expect(
      run('{ "names": $$(li)+ { "name": $ | text } }', '<ul><li>a</li></ul>'),
    ).resolves.toBeDefined()
  })
})

describe('required single selector', () => {
  it('throws when a required selector matches nothing', async () => {
    await expect(run('{ "v": $(h1) | text }', '<div></div>')).rejects.toThrow(
      '$(h1) matched nothing',
    )
  })

  it('does not throw when required selector matches', async () => {
    await expect(
      run('{ "v": $(h1) | text }', '<h1>hello</h1>'),
    ).resolves.toBeDefined()
  })

  it('uses fallback when required primary selector misses', async () => {
    expect(
      await run('{ "v": $(h1) | text ?? $(h2) | text }', '<h2>fallback</h2>'),
    ).toEqual({ v: 'fallback' })
  })
})

describe('merge', () => {
  it('merges array of objects into one', async () => {
    const html =
      '<ul><li><p>Homer</p><span>42</span></li><li><p>Bart</p><span>10</span></li></ul>'
    const result = await run(
      '{ "users": $$(ul > li) { [$(p) | text]: $(span) | text | number } | merge }',
      html,
    )
    expect(result).toEqual({ users: { Homer: 42, Bart: 10 } })
  })
})

describe('omit with ?', () => {
  it('omits the key when element is missing', async () => {
    const result = await run('{ "v": $(.missing)? | text }', '<div></div>')
    expect(result).not.toHaveProperty('v')
  })

  it('includes the key when element is present', async () => {
    const result = await run(
      '{ "v": $(.present)? | text }',
      '<div class="present">hi</div>',
    )
    expect(result).toHaveProperty('v', 'hi')
  })
})

describe('?? selector fallback', () => {
  it('uses first matching selector', async () => {
    const html = '<span class="a">42K</span>'
    const result = await run(
      '{ "v": $(.a) | text | expandSuffix | number ?? $(.b) | text | expandSuffix | number }',
      html,
    )
    expect(result).toEqual({ v: 42000 })
  })

  it('falls back to second selector when first is absent', async () => {
    const html = '<span class="b">42K</span>'
    const result = await run(
      '{ "v": $(.a) | text | expandSuffix | number ?? $(.b) | text | expandSuffix | number }',
      html,
    )
    expect(result).toEqual({ v: 42000 })
  })

  it('applies the pipeline once to whichever matched', async () => {
    const html = '<span class="b">1.2M</span>'
    const result = await run(
      '{ "v": $(.a) | text | expandSuffix | number ?? $(.b) | text | expandSuffix | number }',
      html,
    )
    expect(result).toEqual({ v: 1200000 })
  })

  it('does not apply post-fallback transforms when primary already produced a value', async () => {
    const html =
      '<span class="a" data-id="123"></span><span class="b">456</span>'
    const result = await run('{ "v": $(.a) | data(id) ?? $(.b) | text }', html)
    expect(result).toEqual({ v: '123' })
  })
})

describe('match', () => {
  it('uses the first matching branch', async () => {
    const html = '<video src="blob:x"></video>'
    const result = await run(
      '{ "media": match { $(video[src^=blob]) => { "type": "video" } $([role=presentation]) => { "type": "carousel" } } }',
      html,
    )
    expect(result).toEqual({ media: { type: 'video' } })
  })

  it('skips non-matching branches', async () => {
    const html = '<ul role="presentation"><li></li></ul>'
    const result = await run(
      '{ "media": match { $(video[src^=blob]) => { "type": "video" } $([role=presentation]) => { "type": "carousel" } } }',
      html,
    )
    expect(result).toEqual({ media: { type: 'carousel' } })
  })

  it('falls back to last arm when nothing matches', async () => {
    const html = '<div></div>'
    const result = await run(
      '{ "count": match { $(span.enabled) => { "tag": "count_enabled" } _ => { "tag": "count_disabled" } } }',
      html,
    )
    expect(result).toEqual({ count: { tag: 'count_disabled' } })
  })

  it('match with scalar branch result', async () => {
    const html = '<span aria-label="Carousel"></span>'
    const result = await run(
      '{ "kind": match { $([aria-label=Carousel]) => "carousel" $([aria-label=Clip]) => "clip" _ => null } }',
      html,
    )
    expect(result).toEqual({ kind: 'carousel' })
  })
})

describe('alias @', () => {
  it('allows referencing an ancestor element from a nested $$ block', async () => {
    const html =
      '<ul><li data-list-id="42"><a href="/posts/1">First</a><a href="/posts/2">Second</a></li></ul>'
    const result = await run(
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
  it('returns true branch when condition is truthy', async () => {
    expect(await run('{ "v": $(p) | text ? "yes" : "no" }', '<p>hello</p>')).toEqual({
      v: 'yes',
    })
  })

  it('returns false branch when condition is falsy', async () => {
    expect(await run('{ "v": $(p) | text ? "yes" : "no" }', '<div></div>')).toEqual({
      v: 'no',
    })
  })

  it('omits key when single-arm conditional has no match', async () => {
    const result = await run('{ "v": $(p) | text ? "yes" }', '<div></div>')
    expect(result).not.toHaveProperty('v')
  })
})

describe('watch', () => {
  beforeEach(() => { vi.useFakeTimers() })
  afterEach(() => { vi.useRealTimers() })

  it('exposes reactive interface', async () => {
    const expr = createExpr('watch $$(li) { "v": $ | text }')
    expect(expr.isReactive).toBe(true)
  })

  it('emits initial value on subscribe', async () => {
    const doc = dom('<ul><li>a</li><li>b</li></ul>')
    const reactive = createExpr('watch $$(li) { "v": $ | text }').reactive(
      doc.body,
    )
    const cb = vi.fn()
    reactive.subscribe(cb)
    await vi.waitFor(() =>
      expect(cb).toHaveBeenCalledWith([{ v: 'a' }, { v: 'b' }]),
    )
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
    await vi.waitFor(() =>
      expect(cb).toHaveBeenCalledWith([{ id: '1', link: '/a' }]),
    )

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
    await vi.waitFor(() => expect(cb).toHaveBeenCalledTimes(1))
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
    await vi.waitFor(() => expect(reactive.get()).toEqual([{ v: 'a' }]))

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
    await vi.waitFor(() => expect(cb).toHaveBeenCalledTimes(1))
    unsub()

    const cb2 = vi.fn()
    reactive.subscribe(cb2)
    await vi.waitFor(() => expect(cb2).toHaveBeenCalledWith([{ v: 'a' }]))

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
    await vi.waitFor(() => expect(cb).toHaveBeenCalledWith({ v: 'hello' }))

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
    await vi.waitFor(() =>
      expect(cb).toHaveBeenCalledWith({ test: [{ v: 'a' }, { v: 'b' }] }),
    )

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
    await vi.waitFor(() => expect(cb).toHaveBeenCalledTimes(1))

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
  it('exposes reactive interface', async () => {
    const expr = createExpr('await $$(li) { "v": $ | text }')
    expect(expr.isReactive).toBe(true)
  })

  it('evaluates immediately when condition already exists (self-await)', async () => {
    const doc = dom('<ul><li>a</li></ul>')
    const reactive = createExpr('await $$(li) { "v": $ | text }').reactive(
      doc.body,
    )
    const cb = vi.fn()
    reactive.subscribe(cb)
    await vi.waitFor(() => expect(cb).toHaveBeenCalledWith([{ v: 'a' }]))
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

    await vi.waitFor(() => expect(cb).toHaveBeenCalledWith([{ v: 'x' }]))
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

    await vi.waitFor(() => expect(cb).toHaveBeenCalledTimes(1))

    doc.body.appendChild(doc.createElement('li'))
    await new Promise((r) => setTimeout(r, 0))
    expect(cb).toHaveBeenCalledTimes(1)
  })
})

describe('expression field', () => {
  it('merges fields into parent object', async () => {
    expect(
      await run(
        '{ "a": $(h1) | text, ($(div) { "b": $(span) | text }) }',
        '<h1>hello</h1><div><span>world</span></div>',
      ),
    ).toEqual({ a: 'hello', b: 'world' })
  })

  it('contributes zero keys when selector is missing', async () => {
    expect(
      await run(
        '{ "a": $(h1) | text, ($(#missing) { "b": $ | text }) }',
        '<h1>hello</h1>',
      ),
    ).toEqual({ a: 'hello' })
  })

  it('contributes zero keys with omit selector', async () => {
    expect(
      await run(
        '{ "a": $(h1) | text, ($(#missing)? { "b": $ | text }) }',
        '<h1>hello</h1>',
      ),
    ).toEqual({ a: 'hello' })
  })

  it('coexists with dynamic and static fields', async () => {
    expect(
      await run(
        '{ "x": $(h1) | text, ($(div) { "y": $(span) | text }), [$(h2) | text]: $(p) | text }',
        '<h1>a</h1><div><span>b</span></div><h2>key</h2><p>val</p>',
      ),
    ).toEqual({ x: 'a', y: 'b', key: 'val' })
  })
})

describe('root ref @', () => {
  it('refers to the top-level root element', async () => {
    expect(await run('{ "v": @.($(h1) | text) }', '<h1>hello</h1>')).toEqual({
      v: 'hello',
    })
  })

  it('escapes iteration context inside $$ block', async () => {
    expect(
      await run(
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
  it('evaluates inner expr with current element as context', async () => {
    expect(
      await run(
        '{ "v": $(div).($(.inner) | text) }',
        '<div><span class="inner">hello</span></div>',
      ),
    ).toEqual({ v: 'hello' })
  })

  it('re-scopes into a nested element', async () => {
    expect(
      await run(
        '{ "v": $(div).( $(span) | text ) }',
        '<div><span>hello</span></div>',
      ),
    ).toEqual({ v: 'hello' })
  })

  it('returns null when source is null', async () => {
    expect(await run('{ "v": $(#missing).($ | text) }', '<div>x</div>')).toEqual({
      v: null,
    })
  })
})

describe('onElement highlight callback', () => {
  async function runWithHighlights(expr: string, html: string) {
    const doc = dom(html)
    const highlights: {
      element: Element
      label: { field: string[] }
      isArrayItem: boolean
    }[] = []
    await createExpr(expr, {
      onElement: (element, label, isArrayItem) => {
        highlights.push({ element, label, isArrayItem })
      },
    }).run(doc.body)
    return { doc, highlights }
  }

  it('fires for a single selector with the field label', async () => {
    const { doc, highlights } = await runWithHighlights(
      '{ "title": $(h1) | text }',
      '<h1>hello</h1>',
    )
    expect(highlights).toHaveLength(1)
    expect(highlights[0]!.element).toBe(doc.body.querySelector('h1'))
    expect(highlights[0]!.label).toEqual({ field: ['title'] })
    expect(highlights[0]!.isArrayItem).toBe(false)
  })

  it('fires for fields inside an each block with isArrayItem true', async () => {
    const { doc, highlights } = await runWithHighlights(
      '{ "items": $$(li) { "name": $(span) | text } }',
      '<ul><li><span>a</span></li><li><span>b</span></li></ul>',
    )
    const spans = Array.from(doc.body.querySelectorAll('span'))
    expect(highlights).toHaveLength(2)
    expect(highlights.map((h) => h.element)).toEqual(spans)
    expect(highlights.every((h) => h.isArrayItem)).toBe(false)
    expect(highlights.every((h) => h.label.field.at(-1) === 'name')).toBe(true)
  })

  it('uses dotted path label for nested fields', async () => {
    const { doc, highlights } = await runWithHighlights(
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

  it('throws when a required selector matches nothing', async () => {
    await expect(
      runWithHighlights('{ "v": $(#missing) | text }', '<div>x</div>'),
    ).rejects.toThrow('$(#missing) matched nothing')
  })

  it('fires for the fallback selector when primary misses', async () => {
    const { doc, highlights } = await runWithHighlights(
      '{ "v": $(#missing) ?? $(h1) }',
      '<h1>hello</h1>',
    )
    expect(highlights).toHaveLength(1)
    expect(highlights[0]!.element).toBe(doc.body.querySelector('h1'))
    expect(highlights[0]!.isArrayItem).toBe(false)
  })

  it('does not fire when onElement is not provided', async () => {
    await expect(
      createExpr('{ "v": $(h1) | text }').run(dom('<h1>x</h1>').body),
    ).resolves.toBeDefined()
  })
})

describe('ref', () => {
  it('wraps a value in a ref object', async () => {
    expect(
      await run('$(span) | data(id) | ref', '<span data-id="42"></span>'),
    ).toEqual({ _type: 'ref', _id: '42' })
  })

  it('returns null when value is null', async () => {
    expect(await run('"x" | ref', '<div></div>')).toEqual({ _type: 'ref', _id: 'x' })
  })
})

describe('zip $$(a, b)', () => {
  const tableHtml = `
    <table id="t">
      <thead>
        <tr>
          <td>Marka</td>
          <td>Seri</td>
          <td>Yıl</td>
        </tr>
      </thead>
      <tbody>
        <tr class="row">
          <td class="tag">Audi</td>
          <td class="tag">A5</td>
          <td class="attr">2024</td>
        </tr>
        <tr class="row">
          <td class="tag">Tesla</td>
          <td class="tag">Model Y</td>
          <td class="attr">2023</td>
        </tr>
      </tbody>
    </table>
  `

  it('zips per-row cells against global headers into an attributes map', async () => {
    expect(
      await run(
        '$$(.row) { "attrs": zip(@$$(#t thead td), $$(td:not(.ignored))) { [$1 | text | trim]: $2 | text | trim } | merge }',
        tableHtml,
      ),
    ).toEqual([
      { attrs: { Marka: 'Audi', Seri: 'A5', 'Yıl': '2024' } },
      { attrs: { Marka: 'Tesla', Seri: 'Model Y', 'Yıl': '2023' } },
    ])
  })
})

describe('jsonata pipe', () => {
  it('reshapes an extracted array of breadcrumb anchors', async () => {
    const html = `
      <h2>
        <a href="/x/antalya">Antalya</a>
        <span>/</span>
        <a href="/x/antalya-manavgat">Manavgat</a>
        <span>/</span>
        <a href="/x/antalya-manavgat-ilica">Ilıca Mh.</a>
      </h2>`
    expect(
      await run(
        '{ "location": $$(h2 a) { "t": $ | text } | jsonata({ "city": $[0].t, "district": $[1].t, "neighborhood": $[2].t }) }',
        html,
      ),
    ).toEqual({
      location: { city: 'Antalya', district: 'Manavgat', neighborhood: 'Ilıca Mh.' },
    })
  })

  it('skips the jsonata transform when the upstream value is null', async () => {
    expect(
      await run('{ "v": $(nope)? | text | jsonata($string($)) }', '<h1>x</h1>'),
    ).toEqual({})
  })

  it('parses jsonata source containing nested parens and quotes', async () => {
    const html = '<ul><li>1</li><li>2</li><li>3</li></ul>'
    expect(
      await run(
        '{ "sum": $$(li) { "n": $ | text } | jsonata($sum($map($, function($v) { $number($v.n) }))) }',
        html,
      ),
    ).toEqual({ sum: 6 })
  })
})
