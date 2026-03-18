import { beforeEach, describe, expect, it } from 'vitest'
import type { MatchingResource, PageCheckResult } from './page-evaluator'
import { PageEvaluator } from './page-evaluator'
import type { Resource } from './scrapeer'
import { HTMLParser } from './html-parser'
import { JSDOM } from 'jsdom'
import { sahibinden } from '~/fixtures/sahibinden/sahibinden'

function makeResource(opts: Partial<Resource>) {
  return {
    id: 'test-case',
    hostname: 'example.com',
    url_pattern: '/',
    descriptors: [],
    variables: [],
    meta: [],
    hash: '',
    ...opts,
  } satisfies Partial<Resource>
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
      hostname: 'abc.com',
      url_pattern: '/:test',
      variables: [
        {
          alias: 'test',
          identifier: 'test',
          kind: 'url',
          description: 'test',
        },
      ],
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
      hostname: 'abc.com',
      url_pattern: '/:test_value/',
      variables: [
        {
          alias: 'test_value',
          identifier: 'test_value',
          kind: 'url',
          description: 'test',
        },
      ],
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
      hostname: 'abc.com',
      url_pattern: '/:test',
      variables: [
        {
          alias: 'test',
          identifier: 'test',
          kind: 'url',
          description: 'test',
        },
      ],
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
      hostname: 'abc.com',
      url_pattern: '/:test/:test2',
      variables: [
        {
          alias: 'test',
          identifier: 'test',
          kind: 'url',
          description: 'test',
        },
        {
          alias: 'test2',
          identifier: 'test2',
          kind: 'url',
          description: 'test2',
        },
      ],
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
    const correct = makeResource({ hostname: 'abc.com', url_pattern: '/:test' })
    const pe = new PageEvaluator(document, [makeResource({}), correct])
    expect(pe.checkCurrentPage()).toStrictEqual({
      kind: 'fail',
      reason: 'no-matching-resource',
    } as PageCheckResult)
  })

  it('waits for mutations to occur', { timeout: 1000 }, async () => {
    const correct = makeResource({
      hostname: 'abc.com',
      url_pattern: '/:test',
      wait_for: ['h1'],
      descriptors: [
        {
          kind: 'selector:node',
          selector: 'h1',
          if_missing: { kind: 'recovery:omit' },
          extractors: [
            {
              key: 'title',
              kind: 'extractor:text',
              transformers: [],
            },
          ],
        },
      ],
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
      variables: [
        {
          kind: 'query',
          identifier: 'pagingOffset',
          alias: 'test',
          description: 'test',
        },
        {
          kind: 'url',
          identifier: 'something',
          description: 'whatever',
        },
      ],
      url_pattern: '/:something',
    })
    const pe = new PageEvaluator(document, [r])
    expect(pe.checkCurrentPage()).toStrictEqual({
      kind: 'match',
      resource: r,
      variables: { something: 'abc', test: '34' },
    } satisfies MatchingResource)
  })

  // it('observes nested array selectors', async () => {
  //   const r = makeResource({
  //     descriptors: [
  //       {
  //         kind: 'selector:array',
  //         key: 'links',
  //         selector: 'a',
  //         fields: [
  //           {
  //             kind: 'selector:node',
  //             extractors: [
  //               {
  //                 kind: 'extractor:attribute',
  //                 key: 'href',
  //                 attribute: 'href',
  //                 transformers: [],
  //               },
  //             ],
  //           },
  //         ],
  //       },
  //     ],
  //   })
  //   const dom = new JSDOM('<a href="1"></a><a href="2"></a>', {
  //     url: 'http://localhost',
  //   })
  //   const pe = new PageEvaluator(dom.window.document, [r])
  //   const callback = vitest.fn()
  //   const observer = pe.observe(r, callback)
  //   // dom.window.document.querySelector('a').innerText = 'hello'
  //   dom.window.document.body.insertAdjacentHTML(
  //     'beforeend',
  //     '<a href="3"></a><a href="4"></a>',
  //   )
  //   const records = observer.takeRecords()
  //   expect(records.length).toBe(1)
  //   observer.disconnect()
  // })

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
