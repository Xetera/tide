import { beforeEach, describe, expect, it } from 'vitest'
import { PageEvaluator } from './page-evaluator'
import { PageFunnel } from '~/site-spec/types'
import type { PageFunnelEntry } from '~/site-spec/types'
import { JSDOM } from 'jsdom'

function makeLoader(opts: {
  hostname?: string
  url?: string | string[]
  source?: string
}): PageFunnel {
  const entry: PageFunnelEntry = {
    site: 'test',
    funnel: 'test',
    file: 'test.htmlegy',
    path: 'src/sites/test/loaders/test.htmlegy',
    expression: opts.source ?? '',
    body: opts.source ?? '',
    frontmatter: {},
  }
  return new PageFunnel({
    name: 'test',
    file: 'test.htmlegy',
    path: 'src/sites/test/loaders/test.htmlegy',
    url: opts.url ?? '/',
    hostname: opts.hostname,
    entry,
  })
}

describe('page evaluator', () => {
  let jsdom: JSDOM
  let document: Document

  function setUrl(url: string) {
    jsdom = new JSDOM('<html></html>', { url })
    document = jsdom.window.document
  }

  beforeEach(() => {
    setUrl('https://example.com')
  })

  it('matches a rule by hostname and url pattern', () => {
    setUrl('https://abc.com/abcd123')
    const rule = makeLoader({ hostname: 'abc.com', url: '/*' })
    const pe = new PageEvaluator(document, [rule])
    expect(pe.checkCurrentPage()).toStrictEqual({ kind: 'match', funnel: rule })
  })

  it('does not match a different hostname', () => {
    setUrl('https://www.example.com')
    const rule = makeLoader({ hostname: 'example.com', url: '/' })
    const pe = new PageEvaluator(document, [rule])
    expect(pe.checkCurrentPage()).toMatchObject({
      kind: 'fail',
      reason: 'no-matching-rule',
    })
  })

  it('ignores trailing slash in url pattern', () => {
    setUrl('https://abc.com/abcd123')
    const rule = makeLoader({ hostname: 'abc.com', url: '/*/' })
    const pe = new PageEvaluator(document, [rule])
    expect(pe.checkCurrentPage()).toStrictEqual({ kind: 'match', funnel: rule })
  })

  it('ignores trailing slash in the current url', () => {
    setUrl('https://abc.com/abcd123/')
    const rule = makeLoader({ hostname: 'abc.com', url: '/*' })
    const pe = new PageEvaluator(document, [rule])
    expect(pe.checkCurrentPage()).toStrictEqual({ kind: 'match', funnel: rule })
  })

  it('does not partially match patterns', () => {
    setUrl('https://abc.com/abcd123/extra')
    const rule = makeLoader({ hostname: 'abc.com', url: '/*' })
    const pe = new PageEvaluator(document, [rule])
    expect(pe.checkCurrentPage()).toMatchObject({
      kind: 'fail',
      reason: 'no-matching-rule',
    })
  })

  it('picks the first matching rule when multiple rules exist', () => {
    setUrl('https://abc.com/posts/123')
    const first = makeLoader({ hostname: 'abc.com', url: '/posts/*' })
    const second = makeLoader({ hostname: 'abc.com', url: '/posts/*' })
    const pe = new PageEvaluator(document, [first, second])
    expect(pe.checkCurrentPage()).toStrictEqual({
      kind: 'match',
      funnel: first,
    })
  })

  it('matches when no hostname is specified', () => {
    setUrl('https://anything.com/foo')
    const rule = makeLoader({ hostname: undefined, url: '/foo' })
    const pe = new PageEvaluator(document, [rule])
    expect(pe.checkCurrentPage()).toStrictEqual({ kind: 'match', funnel: rule })
  })

  it('supports multiple url patterns', () => {
    setUrl('https://abc.com/bar/123')
    const rule = makeLoader({
      hostname: 'abc.com',
      url: ['/foo/*', '/bar/*'],
    })
    const pe = new PageEvaluator(document, [rule])
    expect(pe.checkCurrentPage()).toStrictEqual({ kind: 'match', funnel: rule })
  })

  it('updateDocument re-evaluates against the new url', () => {
    setUrl('https://abc.com/foo')
    const rule = makeLoader({ hostname: 'abc.com', url: '/foo' })
    const pe = new PageEvaluator(document, [rule])
    expect(pe.checkCurrentPage()).toStrictEqual({ kind: 'match', funnel: rule })

    setUrl('https://abc.com/bar')
    pe.updateDocument(document)
    expect(pe.checkCurrentPage()).toMatchObject({
      kind: 'fail',
      reason: 'no-matching-rule',
    })
  })
})
