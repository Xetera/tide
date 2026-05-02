import { beforeEach, describe, expect, it } from 'vitest'
import type { MatchingResource, PageCheckResult } from './page-evaluator'
import { PageEvaluator } from './page-evaluator'
import type { PageSpec } from '~/site-spec/types'
import { HTMLParser } from './html-parser'
import { JSDOM } from 'jsdom'
import { sahibindenSite } from '~/sites/sahibinden'

const sahibinden = sahibindenSite.getPages()[0]!

function makeResource(opts: Partial<PageSpec>): PageSpec {
  return {
    $entity: 'test',
    $hostname: 'example.com',
    $urlPattern: '/',
    $fields: {},
    ...opts,
  }
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

  it('should strictly match www. subdomains', () => {
    setUrl('https://www.example.com')
    const pe = new PageEvaluator(document, [makeResource({})])
    expect(pe.checkCurrentPage()).toStrictEqual({
      kind: 'fail',
      reason: 'no-matching-resource',
    } as PageCheckResult)
  })

  it('should match a direct hit', () => {
    setUrl('https://abc.com/abcd123')
    const correct = makeResource({
      $hostname: 'abc.com',
      $urlPattern: '/:test',
      $variables: {
        test: {
          $alias: 'test',
          $kind: 'url',
          $description: 'test',
        },
      },
    })
    const pe = new PageEvaluator(document, [makeResource({}), correct])
    expect(pe.checkCurrentPage()).toStrictEqual({
      kind: 'match',
      resource: correct,
      variables: { test: 'abcd123' },
    } satisfies MatchingResource)
  })

  it('should ignore trailing slashes in a resource', () => {
    setUrl('https://abc.com/abcd123')
    const correct = makeResource({
      $hostname: 'abc.com',
      $urlPattern: '/:test_value/',
      $variables: {
        test_value: {
          $alias: 'test_value',
          $kind: 'url',
          $description: 'test',
        },
      },
    })
    const pe = new PageEvaluator(document, [makeResource({}), correct])
    expect(pe.checkCurrentPage()).toStrictEqual({
      kind: 'match',
      resource: correct,
      variables: { test_value: 'abcd123' },
    } satisfies MatchingResource)
  })

  it('should ignore trailing slashes in a url', () => {
    setUrl('https://abc.com/abcd123/')
    const correct = makeResource({
      $hostname: 'abc.com',
      $urlPattern: '/:test',
      $variables: {
        test: {
          $alias: 'test',
          $kind: 'url',
          $description: 'test',
        },
      },
    })
    const pe = new PageEvaluator(document, [makeResource({}), correct])
    expect(pe.checkCurrentPage()).toStrictEqual({
      kind: 'match',
      resource: correct,
      variables: { test: 'abcd123' },
    } satisfies MatchingResource)
  })

  it('should match a direct hit with multiple variables', () => {
    setUrl('https://abc.com/abcd123/bbcad')
    const correct = makeResource({
      $hostname: 'abc.com',
      $urlPattern: '/:test/:test2',
      $variables: {
        test: {
          $alias: 'test',
          $kind: 'url',
          $description: 'test',
        },
        test2: {
          $alias: 'test2',
          $kind: 'url',
          $description: 'test2',
        },
      },
    })
    const pe = new PageEvaluator(document, [makeResource({}), correct])
    expect(pe.checkCurrentPage()).toStrictEqual({
      kind: 'match',
      resource: correct,
      variables: { test: 'abcd123', test2: 'bbcad' },
    } satisfies PageCheckResult)
  })

  it('wont match partial patterns', () => {
    setUrl('https://abc.com/abcd123/bbcad')
    const correct = makeResource({
      $hostname: 'abc.com',
      $urlPattern: '/:test',
    })
    const pe = new PageEvaluator(document, [makeResource({}), correct])
    expect(pe.checkCurrentPage()).toStrictEqual({
      kind: 'fail',
      reason: 'no-matching-resource',
    } as PageCheckResult)
  })

  it('waits for mutations to occur', { timeout: 1000 }, async () => {
    const correct = makeResource({
      $hostname: 'abc.com',
      $urlPattern: '/:test',
      $waitFor: ['h1'],
      $fields: {
        title: {
          $source: { $css: 'h1' },
          $ifMissing: { $strategy: 'omit' },
          $transform: [{ $text: true }],
        },
      },
    })
    const parser = new HTMLParser(correct)
    const dom = new JSDOM('<div></div>')
    expect(parser.parse(dom.window.document)).toStrictEqual({})
    process.nextTick(() => {
      const elem = dom.window.document.createElement('h1')
      elem.innerHTML = 'test'
      dom.window.document.body.appendChild(elem)
    })
    await PageEvaluator.waitForLoad(dom.window.document, correct)
    expect(parser.parse(dom.window.document)).toStrictEqual({
      title: 'test',
    })
  })

  it('extracts variables from query parameters', () => {
    setUrl('https://example.com/abc?pagingOffset=34&something=xyz')
    const r = makeResource({
      $variables: {
        pagingOffset: {
          $kind: 'query',
          $alias: 'test',
          $description: 'test',
        },
        something: {
          $kind: 'url',
          $description: 'whatever',
        },
      },
      $urlPattern: '/:something',
    })
    const pe = new PageEvaluator(document, [r])
    expect(pe.checkCurrentPage()).toStrictEqual({
      kind: 'match',
      resource: r,
      variables: { something: 'abc', test: '34' },
    } satisfies MatchingResource)
  })

  it('should match both paths in the sahibinden fixture', () => {
    setUrl('https://www.sahibinden.com/otomobil')
    const pe = new PageEvaluator(document, [sahibinden])
    expect(pe.checkCurrentPage()).toStrictEqual({
      kind: 'match',
      resource: sahibinden,
      variables: {
        category: 'otomobil',
        pageOffset: '0',
        region: undefined,
      },
    } satisfies MatchingResource)

    setUrl('https://www.sahibinden.com/satilik/antalya')
    pe.updateDocument(document)
    expect(pe.checkCurrentPage()).toStrictEqual({
      kind: 'match',
      resource: sahibinden,
      variables: {
        category: 'satilik',
        region: 'antalya',
        pageOffset: '0',
      },
    } satisfies MatchingResource)
  })
})
