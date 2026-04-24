import fs from 'node:fs'
import { describe, expect, it } from 'vitest'
import { instagramSite } from '~/sites/instagram'
import { sahibindenSite } from '~/sites/sahibinden'
import { HTMLParser } from './html-parser'
import type { FieldDescriptor, PageSpec } from '~/site-spec/types'

function p(
  fields: Record<string, FieldDescriptor>,
  opts: Partial<Omit<PageSpec, '$fields' | '$entity'>> = {},
) {
  return new HTMLParser({
    $entity: 'test',
    $hostname: 'example.com',
    $urlPattern: '/',
    ...opts,
    $fields: fields,
  })
}

function generateFixture(name: string) {
  const html = fs.readFileSync(`./src/sites/${name}.html`, 'utf-8')
  const result = JSON.parse(
    fs.readFileSync(`./src/sites/${name}.json`, 'utf-8'),
  )
  return { html, result }
}

const sahibinden = sahibindenSite.pages[0]!
const instagram = instagramSite.pages.find(
  (p) => p.$entity === 'instagram:profile',
)!

describe.concurrent('html-parser', () => {
  it('should parse sahibinden fixture', async () => {
    const { html, result } = generateFixture(
      'sahibinden/sahibinden.real-estate',
    )
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
          $source: { $css: 'div' },
          $transform: [{ $text: true }, { $cast: 'number' }],
        },
      },
      {
        $meta: {
          locale: {
            $source: { $css: 'html' },
            $transform: [{ $attr: 'lang' }],
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
    const parser = p({
      text: { $source: { $css: 'div' }, $transform: [{ $text: true }] },
    })
    expect(parser.parse('<div>  hello  </div>')).toStrictEqual({
      text: '  hello  ',
    })
  })

  it('extracts attributes', () => {
    const parser = p({
      hello: {
        $source: { $css: 'a' },
        $transform: [{ $attr: 'hello' }],
      },
    })
    expect(parser.parse('<a hello="3">link</a>')).toStrictEqual({ hello: '3' })
  })

  it('selects arrays', () => {
    const parser = p({
      links: {
        $sourceEach: { $cssEach: 'a' },
        $fields: {
          href: { $transform: [{ $attr: 'href' }] },
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
          $source: { $css: 'a' },
          $transform: [{ $attr: 'href' }, { $cast: 'url' }],
        },
      },
      { $hostname: 'example.com' },
    )
    expect(parser.parse('<a href="/1"></a>')).toStrictEqual({
      href: 'https://example.com/1',
    })
  })

  it('transforms regex', () => {
    const parser = p({
      name: {
        $source: { $css: 'div' },
        $transform: [{ $text: true }, { $regex: 'stan (.+)' }],
      },
    })
    expect(
      parser.parse('<div><span>stan</span> dreamcatcher</div>'),
    ).toStrictEqual({
      name: 'dreamcatcher',
    })
  })

  it("matches regex if a replacement isn't supplied", () => {
    const parser = p({
      name: {
        $source: { $css: 'div' },
        $transform: [{ $text: true }, { $regex: String.raw`(\d+)` }],
      },
    })
    expect(parser.parse('<div>100 good memes</div>')).toStrictEqual({
      name: '100',
    })
  })

  it('correctly warns on immediately available selectors', async () => {
    const parser = p(
      { name: { $source: { $css: 'div' }, $transform: [{ $text: true }] } },
      { $waitFor: ['div'] },
    )
    await expect(
      parser.parseAsync('<div>hello \nworld</div>'),
    ).resolves.toStrictEqual({ name: 'hello \nworld' })
    expect(parser.warnings).toHaveLength(1)
  })

  it('uses variant arrays', () => {
    const parser = p({
      media: [
        {
          $source: { $css: '.video' },
          $fields: {
            type: { $literal: 'video' },
          },
        },
        {
          $source: { $css: '.image' },
          $fields: {
            type: { $literal: 'image' },
            src: {
              $source: { $css: 'img' },
              $transform: [{ $attr: 'src' }],
            },
          },
        },
      ],
    })
    expect(
      parser.parse('<div><div class="image"><img src="test.jpg"></div></div>'),
    ).toStrictEqual({
      media: { type: 'image', src: 'test.jpg' },
    })
  })

  it('uses $ifMissing omit strategy', () => {
    const parser = p({
      name: {
        $source: { $css: 'div.missing' },
        $ifMissing: { $strategy: 'omit' },
        $transform: [{ $text: true }],
      },
    })
    expect(parser.parse('<p>nothing</p>')).toStrictEqual({})
  })

  it('uses $ifMissing fallback with $literal', () => {
    const parser = p({
      name: {
        $source: { $css: 'div.missing' },
        $ifMissing: { $strategy: 'fallback', $value: { $literal: 'Unknown' } },
        $transform: [{ $text: true }],
      },
    })
    expect(parser.parse('<p>nothing</p>')).toStrictEqual({ name: 'Unknown' })
  })

  it('transforms lowercase', () => {
    const parser = p({
      name: {
        $source: { $css: 'div' },
        $transform: [{ $text: true }, { $lowercase: true }],
      },
    })
    expect(parser.parse('<div>HELLO WORLD</div>')).toStrictEqual({
      name: 'hello world',
    })
  })

  it('parses $sourceEach inside nested $fields', () => {
    const parser = p({
      comments: {
        $fields: {
          list: {
            $sourceEach: { $cssEach: 'ul > li' },
            $fields: {
              username: {
                $source: { $css: 'b' },
                $transform: [{ $text: true }],
              },
              comment: {
                $source: { $css: 'span' },
                $transform: [{ $text: true }],
              },
            },
          },
        },
      },
    })
    const html = `
      <ul>
        <li><b>alice</b><span>hello</span></li>
        <li><b>bob</b><span>world</span></li>
      </ul>
    `
    expect(parser.parse(html)).toStrictEqual({
      comments: {
        list: [
          { username: 'alice', comment: 'hello' },
          { username: 'bob', comment: 'world' },
        ],
      },
    })
  })

  it('extracts value from loader result', () => {
    const parser = new HTMLParser({
      $entity: 'test',
      $urlPattern: '/',
      $fields: {
        count: {
          $source: { $query: 'myQuery' },
        },
      },
    })
    expect(
      parser.parse('<html><body></body></html>', {
        loaderResults: { myQuery: [42] },
      }),
    ).toStrictEqual({
      count: 42,
    })
  })

  it('produces an array from loader result', () => {
    const parser = new HTMLParser({
      $entity: 'test',
      $urlPattern: '/',
      $fields: {
        items: {
          $source: { $query: 'myQuery' },
        },
      },
    })
    expect(
      parser.parse('<html><body></body></html>', {
        loaderResults: { myQuery: [['a', 'b']] },
      }),
    ).toStrictEqual({
      items: ['a', 'b'],
    })
  })
})
