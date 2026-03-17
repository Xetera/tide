import fs from 'node:fs'
import { describe, expect, it } from 'vitest'
import { instagram } from '~/fixtures/instagram/instagram'
import { sahibinden } from '~/fixtures/sahibinden/sahibinden'
import { HTMLParser } from './html-parser'
import type { Resource } from './scrapeer'

function p(opts: Partial<Resource>) {
  return new HTMLParser({
    id: 'test-case',
    hostname: 'example.com',
    url_pattern: '/',
    descriptors: [],
    variables: [],
    meta: [],
    hash: '',
    ...opts,
  } satisfies Partial<Resource>)
}

function generateFixture(name: string) {
  const html = fs.readFileSync(`./src/fixtures/${name}.html`, 'utf-8')
  const result = JSON.parse(
    fs.readFileSync(`./src/fixtures/${name}.json`, 'utf-8'),
  )
  return { html, result }
}

describe.concurrent('html-parser', () => {
  it('should parse sahibinden fixture', async () => {
    const { html, result } = generateFixture(
      'sahibinden/sahibinden.real-estate',
    )
    const rp = new HTMLParser(sahibinden)
    const output = rp.parse(html)
    // console.log(JSON.stringify(output, true, 8))
    expect(output).toStrictEqual(result)
  })

  it('should parse sahibinden cars fixture', async () => {
    const { html, result } = generateFixture('sahibinden/sahibinden.cars')
    const rp = new HTMLParser(sahibinden)
    const output = rp.parse(html)
    expect(output).toStrictEqual(result)
  })

  it('should parse instagram fixture', async () => {
    const { html, result } = generateFixture('instagram/instagram')
    const rp = new HTMLParser(instagram)
    const output = rp.parse(html)
    expect(output).toStrictEqual(result)
  })

  it('should use locale to parse ambiguous numbers', () => {
    const parser = p({
      meta: [
        {
          kind: 'selector:node',
          selector: 'html',
          extractors: [
            {
              kind: 'extractor:attribute',
              key: 'locale',
              attribute: 'lang',
              transformers: [],
            },
          ],
        },
      ],
      descriptors: [
        {
          kind: 'selector:node',
          selector: 'div',
          extractors: [
            {
              kind: 'extractor:text',
              key: 'price',
              transformers: [
                {
                  kind: 'transformer:cast',
                  type: 'number',
                },
              ],
            },
          ],
        },
      ],
    })
    const htmlEn = '<html lang="en"><body><div>1.435</div></body></html>'
    expect(parser.parse(htmlEn)).toStrictEqual({ price: 1.435 })
    const htmlTr = '<html lang="tr"><body><div>1.435</div></body></html>'
    expect(parser.parse(htmlTr)).toStrictEqual({ price: 1435 })
  })

  it('extracts nodes', () => {
    const parser = p({
      descriptors: [
        {
          kind: 'selector:node',
          selector: 'div',
          extractors: [
            {
              kind: 'extractor:text',
              key: 'text',
              transformers: [],
            },
          ],
        },
      ],
    })
    expect(parser.parse('<div>  hello  </div>')).toStrictEqual({
      text: '  hello  ',
    })
  })

  it('extracts attributes', () => {
    const parser = p({
      descriptors: [
        {
          kind: 'selector:node',
          selector: 'a',
          extractors: [
            {
              kind: 'extractor:attribute',
              key: 'hello',
              attribute: 'hello',
              transformers: [],
            },
          ],
        },
      ],
    })
    expect(parser.parse('<a hello="3">link</a>')).toStrictEqual({ hello: '3' })
  })

  it('selects arrays', () => {
    const parser = p({
      descriptors: [
        {
          kind: 'selector:array',
          key: 'links',
          selector: 'a',
          fields: [
            {
              kind: 'selector:self',
              extractors: [
                {
                  kind: 'extractor:attribute',
                  key: 'href',
                  attribute: 'href',
                  transformers: [],
                },
              ],
            },
          ],
        },
      ],
    })
    expect(
      parser.parse('<div><a href="1"></a><a href="2"></a></div>'),
    ).toStrictEqual({ links: [{ href: '1' }, { href: '2' }] })
  })

  it('transforms urls according to the hostname', () => {
    const parser = p({
      hostname: 'example.com',
      descriptors: [
        {
          kind: 'selector:node',
          selector: 'a',
          extractors: [
            {
              kind: 'extractor:attribute',
              key: 'href',
              attribute: 'href',
              transformers: [
                {
                  kind: 'transformer:cast',
                  type: 'url',
                },
              ],
            },
          ],
        },
      ],
    })
    expect(parser.parse('<a href="/1"></a>')).toStrictEqual({
      href: 'https://example.com/1',
    })
  })

  it('transforms regex', () => {
    const parser = p({
      descriptors: [
        {
          kind: 'selector:node',
          selector: 'div',
          extractors: [
            {
              kind: 'extractor:text',
              key: 'name',
              transformers: [
                {
                  kind: 'transformer:regex',
                  regex: 'stan (.+)',
                },
              ],
            },
          ],
        },
      ],
    })
    expect(
      parser.parse('<div><span>stan</span> dreamcatcher</div>'),
    ).toStrictEqual({
      name: 'dreamcatcher',
    })
  })

  it("matches regex if a replacement isn't supplied", () => {
    const parser = p({
      descriptors: [
        {
          kind: 'selector:node',
          selector: 'div',
          extractors: [
            {
              kind: 'extractor:text',
              key: 'name',
              transformers: [
                {
                  kind: 'transformer:regex',
                  regex: '(\\d+)',
                },
              ],
            },
          ],
        },
      ],
    })
    expect(parser.parse('<div>100 good memes</div>')).toStrictEqual({
      name: '100',
    })
  })

  it('ignores unrecognized transformers', () => {
    const parser = p({
      descriptors: [
        {
          kind: 'selector:node',
          selector: 'div',
          extractors: [
            {
              kind: 'extractor:text',
              key: 'name',
              transformers: [
                {
                  // @ts-expect-error | invalid transformer on purpose
                  kind: 'transformer:unknown',
                },
              ],
            },
          ],
        },
      ],
    })
    expect(parser.parse('<div>4815162342</div>')).toStrictEqual({
      name: '4815162342',
    })
    expect(parser.warnings).toHaveLength(1)
  })

  it('correctly warns on immediately available selectors', async () => {
    const parser = p({
      wait_for: ['div'],
      descriptors: [
        {
          kind: 'selector:node',
          selector: 'div',
          extractors: [
            {
              kind: 'extractor:text',
              key: 'name',
              transformers: [],
            },
          ],
        },
      ],
    })
    await expect(
      parser.parseAsync('<div>hello \nworld</div>'),
    ).resolves.toStrictEqual({
      name: 'hello \nworld',
    })
    expect(parser.warnings).toHaveLength(1)
  })

  it('creates objects for dot-separated keys', async () => {
    const parser = p({
      descriptors: [
        {
          kind: 'selector:node',
          selector: 'div',
          extractors: [
            {
              kind: 'extractor:text',
              key: 'foo.bar',
              transformers: [],
            },
            {
              kind: 'extractor:attribute',
              key: 'foo.baz',
              attribute: 'hello',
              transformers: [],
            },
          ],
        },
      ],
    })
    await expect(
      parser.parseAsync('<div hello="zoop">4815162342</div>'),
    ).resolves.toStrictEqual({
      foo: { bar: '4815162342', baz: 'zoop' },
    })
  })

  it('fallsback when ', async () => {
    const parser = p({
      descriptors: [
        {
          kind: 'selector:node',
          selector: 'div',
          extractors: [
            {
              kind: 'extractor:text',
              key: 'foo.bar',
              transformers: [],
            },
            {
              kind: 'extractor:attribute',
              key: 'foo.baz',
              attribute: 'hello',
              transformers: [],
            },
          ],
        },
      ],
    })
    await expect(
      parser.parseAsync('<div hello="zoop">4815162342</div>'),
    ).resolves.toStrictEqual({
      foo: { bar: '4815162342', baz: 'zoop' },
    })
  })

  // it('parses pseudo selector styles', async () => {
  //   const parser = p({
  //     descriptors: [
  //       {
  //         kind: 'selector:node',
  //         selector: 'div',
  //         extractors: [
  //           {
  //             kind: 'extractor:style',
  //             key: 'style',
  //             pseudo: ':before',
  //             declaration: 'content',
  //             transformers: [],
  //           },
  //         ],
  //       },
  //     ],
  //   })
  //   await expect(
  //     parser.parseAsync(
  //       '<style>.zoop:before { content: "testing" }</style><div hello="zoop"></div>',
  //     ),
  //   ).resolves.toStrictEqual({
  //     foo: { stype: 'testing' },
  //   })
  // })
})
