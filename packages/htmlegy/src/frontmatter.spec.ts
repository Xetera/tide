import { describe, expect, it } from 'vitest'
import { parse } from './parser'

describe('parse', () => {
  it('parses an object expression', () => {
    const expr = parse('{ "name": $(h1):text }')
    expect(expr.kind).toBe('object')
  })

  it('parses a pipeline expression', () => {
    const expr = parse('$(h1):text')
    expect(expr.kind).toBe('pipeline')
  })

  it('parses an array expression', () => {
    const expr = parse('[ $(h1):text ]')
    expect(expr.kind).toBe('array')
  })

  it('throws on invalid expression', () => {
    expect(() => parse('!!invalid!!')).toThrow()
  })
})
