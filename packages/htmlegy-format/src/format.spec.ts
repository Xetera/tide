import { describe, expect, test } from 'vitest'
import { parse } from '@tide/htmlegy'
import { format } from './index'

function idempotent(src: string): string {
  const once = format(src)
  const twice = format(once)
  expect(twice).toBe(once)
  return once
}

function preservesStructure(src: string): void {
  const formatted = idempotent(src)
  const a = JSON.stringify(parse(src), stripTrivia)
  const b = JSON.stringify(parse(formatted), stripTrivia)
  expect(b).toBe(a)
}

function stripTrivia(key: string, value: unknown): unknown {
  if (key === 'span' || key === 'leading' || key === 'trailing') {
    return undefined
  }
  return value
}

describe('format', () => {
  test('object with selectors', () => {
    expect(format('{"title":$(.title),"price":$(.price)}'))
      .toMatchInlineSnapshot(`
      "{ "title": $(.title), "price": $(.price) }
      "
    `)
  })

  test('breaks wide objects across lines', () => {
    const src =
      '{"a":$(.aaaaaaaa),"b":$(.bbbbbbbb),"c":$(.cccccccc),"d":$(.dddddddd),"e":$(.eeeeeeee)}'
    expect(format(src)).toMatchInlineSnapshot(`
      "{
        "a": $(.aaaaaaaa),
        "b": $(.bbbbbbbb),
        "c": $(.cccccccc),
        "d": $(.dddddddd),
        "e": $(.eeeeeeee)
      }
      "
    `)
  })

  test('pipes and fallback', () => {
    expect(format('$(.x) | trim | upper ?? "fallback"')).toMatchInlineSnapshot(`
      "$(.x) | trim | upper ?? "fallback"
      "
    `)
  })

  test('plain match block', () => {
    const src = 'match { $(.a) => $ | text, $(.b) => "y", _ => null }'
    expect(format(src)).toMatchInlineSnapshot(`
      "match {
        $(.a) => $ | text,
        $(.b) => "y",
        _ => null
      }
      "
    `)
  })

  test('match expression with scrutinee', () => {
    const src = 'match $(h1) | text { "Hello" => "yes", _ => "no" }'
    expect(format(src)).toMatchInlineSnapshot(`
      "match $(h1) | text {
        "Hello" => "yes",
        _ => "no"
      }
      "
    `)
  })

  test('preserves leading and trailing comments', () => {
    const src = [
      '{',
      '  // the product title',
      '  "title": $(.t), // inline',
      '  "price": $(.p),',
      '}',
    ].join('\n')
    const out = format(src)
    expect(out).toContain('// the product title')
    expect(out).toContain('// inline')
  })

  test('idempotent on nested structures', () => {
    preservesStructure(
      '{"items":$$(.row)+{"name":$(.n),"img":$(img)?},"count":$(.c)|int}',
    )
  })

  test('structure preserved with comments', () => {
    preservesStructure(
      [
        '// header',
        '{',
        '  "a": $(.a) | trim, // a',
        '  "b": @alias$(.b),',
        '}',
      ].join('\n'),
    )
  })

  test('preserves trailing comment without corrupting following field', () => {
    const src = ['{', '  "a": $(.a), // a', '  "b": $(.b),', '}'].join('\n')
    const out = format(src)
    expect(out).toContain('// a')
    expect(parse(out)).toBeTruthy()
  })

  test('preserves yaml frontmatter verbatim and formats the body', () => {
    const src = ['---', 'name: "Listing"', 'url: "/x/*/y"', '---', '{"a":$(.a)}'].join(
      '\n',
    )
    expect(format(src)).toBe(
      ['---', 'name: "Listing"', 'url: "/x/*/y"', '---', '{ "a": $(.a) }', ''].join(
        '\n',
      ),
    )
  })

  test('jsonata pipe preserves raw source and parens', () => {
    preservesStructure(
      '{ "loc": $$(h2 a) { "t": $ | text } | jsonata({ "city": $[0].t, "district": $[1].t }) }',
    )
  })

  test('jsonata pipe with nested parens in source', () => {
    preservesStructure(
      '{ "sum": $$(li) { "n": $ | text } | jsonata($sum($map($, function($v) { $number($v.n) }))) }',
    )
  })
})
