import { beforeEach, describe, expect, it } from 'vitest'
import { PageEvaluator } from './page-evaluator'
import { PageLoader } from '~/site-spec/types'
import type { LoaderEntry } from '~/loaders'
import { JSDOM } from 'jsdom'

function makeLoader(opts: { hostname?: string; urlPattern?: string | string[]; source?: string }): PageLoader {
  const entry: LoaderEntry = {
    site: 'test',
    loader: 'test',
    file: 'test.htmlevate',
    path: 'src/sites/test/loaders/test.htmlevate',
    expression: opts.source ?? '',
    format: 'htmlevate',
  }
  return new PageLoader({ name: 'test', file: 'test.htmlevate', path: 'src/sites/test/loaders/test.htmlevate', urlPattern: opts.urlPattern ?? '/', hostname: opts.hostname, entry })
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
    const rule = makeLoader({ hostname: 'abc.com', urlPattern: '/*' })
    const pe = new PageEvaluator(document, [rule])
    expect(pe.checkCurrentPage()).toStrictEqual({ kind: 'match', loader: rule })
  })

  it('does not match a different hostname', () => {
    setUrl('https://www.example.com')
    const rule = makeLoader({ hostname: 'example.com', urlPattern: '/' })
    const pe = new PageEvaluator(document, [rule])
    expect(pe.checkCurrentPage()).toMatchObject({ kind: 'fail', reason: 'no-matching-rule' })
  })

  it('ignores trailing slash in url pattern', () => {
    setUrl('https://abc.com/abcd123')
    const rule = makeLoader({ hostname: 'abc.com', urlPattern: '/*/' })
    const pe = new PageEvaluator(document, [rule])
    expect(pe.checkCurrentPage()).toStrictEqual({ kind: 'match', loader: rule })
  })

  it('ignores trailing slash in the current url', () => {
    setUrl('https://abc.com/abcd123/')
    const rule = makeLoader({ hostname: 'abc.com', urlPattern: '/*' })
    const pe = new PageEvaluator(document, [rule])
    expect(pe.checkCurrentPage()).toStrictEqual({ kind: 'match', loader: rule })
  })

  it('does not partially match patterns', () => {
    setUrl('https://abc.com/abcd123/extra')
    const rule = makeLoader({ hostname: 'abc.com', urlPattern: '/*' })
    const pe = new PageEvaluator(document, [rule])
    expect(pe.checkCurrentPage()).toMatchObject({ kind: 'fail', reason: 'no-matching-rule' })
  })

  it('picks the first matching rule when multiple rules exist', () => {
    setUrl('https://abc.com/posts/123')
    const first = makeLoader({ hostname: 'abc.com', urlPattern: '/posts/*' })
    const second = makeLoader({ hostname: 'abc.com', urlPattern: '/posts/*' })
    const pe = new PageEvaluator(document, [first, second])
    expect(pe.checkCurrentPage()).toStrictEqual({ kind: 'match', loader: first })
  })

  it('matches when no hostname is specified', () => {
    setUrl('https://anything.com/foo')
    const rule = makeLoader({ hostname: undefined, urlPattern: '/foo' })
    const pe = new PageEvaluator(document, [rule])
    expect(pe.checkCurrentPage()).toStrictEqual({ kind: 'match', loader: rule })
  })

  it('supports multiple url patterns', () => {
    setUrl('https://abc.com/bar/123')
    const rule = makeLoader({ hostname: 'abc.com', urlPattern: ['/foo/*', '/bar/*'] })
    const pe = new PageEvaluator(document, [rule])
    expect(pe.checkCurrentPage()).toStrictEqual({ kind: 'match', loader: rule })
  })

  it('updateDocument re-evaluates against the new url', () => {
    setUrl('https://abc.com/foo')
    const rule = makeLoader({ hostname: 'abc.com', urlPattern: '/foo' })
    const pe = new PageEvaluator(document, [rule])
    expect(pe.checkCurrentPage()).toStrictEqual({ kind: 'match', loader: rule })

    setUrl('https://abc.com/bar')
    pe.updateDocument(document)
    expect(pe.checkCurrentPage()).toMatchObject({ kind: 'fail', reason: 'no-matching-rule' })
  })
})
