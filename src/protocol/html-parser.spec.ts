import fs from 'node:fs'
import { describe, expect, it } from 'vitest'
import { instagram } from '~/fixtures/instagram/instagram'
import { sahibinden } from '~/fixtures/sahibinden/sahibinden'
import { HTMLParser } from './html-parser'
import type { FieldDescriptor, Resource } from './scrapeer'

function p(fields: Record<string, FieldDescriptor>, opts: Partial<Omit<Resource, '$fields'>> = {}) {
  return new HTMLParser({
    $id: 'test-case',
    $hostname: 'example.com',
    $urlPattern: '/',
    $hash: '',
    ...opts,
    $fields: fields,
  })
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
    const { html, result } = generateFixture('sahibinden/sahibinden.real-estate')
    const rp = new HTMLParser(sahibinden)
    const output = rp.parse(html)
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
    const parser = p(
      {
        price: {
          $selector: 'div',
          $extractor: {
            $extractor: 'text',
            $transformers: [{ $transformer: 'cast', $cast: 'number' }],
          },
        },
      },
      {
        $meta: {
          locale: {
            $selector: 'html',
            $extractor: { $extractor: 'attribute', $attribute: 'lang' },
          },
        },
      },
    )
    const htmlEn = '<html lang="en"><body><div>1.435</div></body></html>'
    expect(parser.parse(htmlEn)).toStrictEqual({ price: 1.435 })
    const htmlTr = '<html lang="tr"><body><div>1.435</div></body></html>'
    expect(parser.parse(htmlTr)).toStrictEqual({ price: 1435 })
  })

  it('extracts nodes', () => {
    const parser = p({ text: { $selector: 'div', $extractor: { $extractor: 'text' } } })
    expect(parser.parse('<div>  hello  </div>')).toStrictEqual({ text: '  hello  ' })
  })

  it('extracts attributes', () => {
    const parser = p({
      hello: { $selector: 'a', $extractor: { $extractor: 'attribute', $attribute: 'hello' } },
    })
    expect(parser.parse('<a hello="3">link</a>')).toStrictEqual({ hello: '3' })
  })

  it('selects arrays', () => {
    const parser = p({
      links: {
        $selectorEach: 'a',
        $fields: {
          href: { $extractor: { $extractor: 'attribute', $attribute: 'href' } },
        },
      },
    })
    expect(
      parser.parse('<div><a href="1"></a><a href="2"></a></div>'),
    ).toStrictEqual({ links: [{ href: '1' }, { href: '2' }] })
  })

  it('transforms urls according to the hostname', () => {
    const parser = p(
      {
        href: {
          $selector: 'a',
          $extractor: {
            $extractor: 'attribute',
            $attribute: 'href',
            $transformers: [{ $transformer: 'cast', $cast: 'url' }],
          },
        },
      },
      { $hostname: 'example.com' },
    )
    expect(parser.parse('<a href="/1"></a>')).toStrictEqual({ href: 'https://example.com/1' })
  })

  it('transforms regex', () => {
    const parser = p({
      name: {
        $selector: 'div',
        $extractor: {
          $extractor: 'text',
          $transformers: [{ $transformer: 'regex', $regex: 'stan (.+)' }],
        },
      },
    })
    expect(parser.parse('<div><span>stan</span> dreamcatcher</div>')).toStrictEqual({
      name: 'dreamcatcher',
    })
  })

  it("matches regex if a replacement isn't supplied", () => {
    const parser = p({
      name: {
        $selector: 'div',
        $extractor: {
          $extractor: 'text',
          $transformers: [{ $transformer: 'regex', $regex: String.raw`(\d+)` }],
        },
      },
    })
    expect(parser.parse('<div>100 good memes</div>')).toStrictEqual({ name: '100' })
  })

  it('ignores unrecognized transformers', () => {
    const parser = p({
      name: {
        $selector: 'div',
        $extractor: {
          $extractor: 'text',
          $transformers: [
            {
              // @ts-expect-error | invalid transformer on purpose
              $transformer: 'unknown',
            },
          ],
        },
      },
    })
    expect(parser.parse('<div>4815162342</div>')).toStrictEqual({ name: '4815162342' })
    expect(parser.warnings).toHaveLength(1)
  })

  it('correctly warns on immediately available selectors', async () => {
    const parser = p(
      { name: { $selector: 'div', $extractor: { $extractor: 'text' } } },
      { $waitFor: ['div'] },
    )
    await expect(
      parser.parseAsync('<div>hello \nworld</div>'),
    ).resolves.toStrictEqual({ name: 'hello \nworld' })
    expect(parser.warnings).toHaveLength(1)
  })

  it('uses variants in arrays', () => {
    const parser = p({
      items: {
        $selectorEach: 'li',
        $variants: [
          {
            $match: { $css: 'li.active' },
            $fields: {
              tag: { $literal: 'active' },
              name: { $selector: 'span', $extractor: { $extractor: 'text' } },
            },
          },
          {
            $fields: {
              tag: { $literal: 'inactive' },
            },
          },
        ],
      },
    })
    expect(
      parser.parse('<ul><li class="active"><span>Homer</span></li><li>Bart</li></ul>'),
    ).toStrictEqual({
      items: [
        { tag: 'active', name: 'Homer' },
        { tag: 'inactive' },
      ],
    })
  })

  it('uses $ifMissing omit strategy', () => {
    const parser = p({
      name: {
        $selector: 'div.missing',
        $ifMissing: { $strategy: 'omit' },
        $extractor: { $extractor: 'text' },
      },
    })
    expect(parser.parse('<p>nothing</p>')).toStrictEqual({})
  })

  it('uses $ifMissing fallback with $literal', () => {
    const parser = p({
      name: {
        $selector: 'div.missing',
        $ifMissing: { $strategy: 'fallback', $value: { $literal: 'Unknown' } },
        $extractor: { $extractor: 'text' },
      },
    })
    expect(parser.parse('<p>nothing</p>')).toStrictEqual({ name: 'Unknown' })
  })

  it('transforms lowercase', () => {
    const parser = p({
      name: {
        $selector: 'div',
        $extractor: {
          $extractor: 'text',
          $transformers: [{ $transformer: 'lowercase' }],
        },
      },
    })
    expect(parser.parse('<div>HELLO WORLD</div>')).toStrictEqual({ name: 'hello world' })
  })
})
