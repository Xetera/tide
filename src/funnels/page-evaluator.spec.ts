import { beforeEach, describe, expect, it } from 'vitest'
import { PageEvaluator } from './page-evaluator'
import { PageFunnel } from '~/funnels/types'
import type { PageFunnelEntry } from '~/funnels/types'
import { JSDOM } from 'jsdom'

function makeFunnel(opts: {
  hostname?: string
  url?: string | string[]
  source?: string
}): PageFunnel {
  const entry: PageFunnelEntry = {
    site: 'test',
    funnel: 'test',
    file: 'test.htmlegy',
    path: 'src/sites/test/funnels/test.htmlegy',
    expression: opts.source ?? '',
    body: opts.source ?? '',
    frontmatter: {},
  }
  return new PageFunnel({
    name: 'test',
    site: 'test',
    file: 'test.htmlegy',
    path: 'src/sites/test/funnels/test.htmlegy',
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
    const rule = makeFunnel({ hostname: 'abc.com', url: '/*' })
    const pe = new PageEvaluator(document, [rule])
    expect(pe.checkCurrentPage()).toStrictEqual({
      kind: 'match',
      funnels: [rule],
    })
  })

  it('does not match a different hostname', () => {
    setUrl('https://www.example.com')
    const rule = makeFunnel({ hostname: 'example.com', url: '/' })
    const pe = new PageEvaluator(document, [rule])
    expect(pe.checkCurrentPage()).toMatchObject({
      kind: 'fail',
      reason: 'no-matching-rule',
    })
  })

  it('ignores trailing slash in url pattern', () => {
    setUrl('https://abc.com/abcd123')
    const rule = makeFunnel({ hostname: 'abc.com', url: '/*/' })
    const pe = new PageEvaluator(document, [rule])
    expect(pe.checkCurrentPage()).toStrictEqual({
      kind: 'match',
      funnels: [rule],
    })
  })

  it('ignores trailing slash in the current url', () => {
    setUrl('https://abc.com/abcd123/')
    const rule = makeFunnel({ hostname: 'abc.com', url: '/*' })
    const pe = new PageEvaluator(document, [rule])
    expect(pe.checkCurrentPage()).toStrictEqual({
      kind: 'match',
      funnels: [rule],
    })
  })

  it('does not partially match patterns', () => {
    setUrl('https://abc.com/abcd123/extra')
    const rule = makeFunnel({ hostname: 'abc.com', url: '/*' })
    const pe = new PageEvaluator(document, [rule])
    expect(pe.checkCurrentPage()).toMatchObject({
      kind: 'fail',
      reason: 'no-matching-rule',
    })
  })

  it('returns all matching rules when multiple rules match', () => {
    setUrl('https://abc.com/posts/123')
    const first = makeFunnel({ hostname: 'abc.com', url: '/posts/*' })
    const second = makeFunnel({ hostname: 'abc.com', url: '/posts/*' })
    const pe = new PageEvaluator(document, [first, second])
    expect(pe.checkCurrentPage()).toStrictEqual({
      kind: 'match',
      funnels: [first, second],
    })
  })

  it('filters non-matching rules when returning multiple matches', () => {
    setUrl('https://abc.com/posts/123')
    const matching = makeFunnel({ hostname: 'abc.com', url: '/posts/*' })
    const skipped = makeFunnel({ hostname: 'abc.com', url: '/users/*' })
    const alsoMatching = makeFunnel({ hostname: 'abc.com', url: '/posts/123' })
    const pe = new PageEvaluator(document, [matching, skipped, alsoMatching])
    expect(pe.checkCurrentPage()).toStrictEqual({
      kind: 'match',
      funnels: [matching, alsoMatching],
    })
  })

  it('matches when no hostname is specified', () => {
    setUrl('https://anything.com/foo')
    const rule = makeFunnel({ hostname: undefined, url: '/foo' })
    const pe = new PageEvaluator(document, [rule])
    expect(pe.checkCurrentPage()).toStrictEqual({
      kind: 'match',
      funnels: [rule],
    })
  })

  it('supports multiple url patterns', () => {
    setUrl('https://abc.com/bar/123')
    const rule = makeFunnel({
      hostname: 'abc.com',
      url: ['/foo/*', '/bar/*'],
    })
    const pe = new PageEvaluator(document, [rule])
    expect(pe.checkCurrentPage()).toStrictEqual({
      kind: 'match',
      funnels: [rule],
    })
  })

  it('updateDocument re-evaluates against the new url', () => {
    setUrl('https://abc.com/foo')
    const rule = makeFunnel({ hostname: 'abc.com', url: '/foo' })
    const pe = new PageEvaluator(document, [rule])
    expect(pe.checkCurrentPage()).toStrictEqual({
      kind: 'match',
      funnels: [rule],
    })

    setUrl('https://abc.com/bar')
    pe.updateDocument(document)
    expect(pe.checkCurrentPage()).toMatchObject({
      kind: 'fail',
      reason: 'no-matching-rule',
    })
  })
})
