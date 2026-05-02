import { describe, expect, it } from 'vitest'
import { parse } from '~/htmlevate/parser'

describe('parse', () => {
  describe('frontmatter parsing', () => {
    it('parses a scalar value', () => {
      const { frontmatter } = parse('entity = @instagram/profile\n{ "x": $(h1):text }')
      expect(frontmatter.entity).toBe('@instagram/profile')
    })

    it('parses multiple scalar entries', () => {
      const { frontmatter } = parse(
        'entity = @instagram/profile\nurlPattern = /:handle/\n{ "x": $(h1):text }',
      )
      expect(frontmatter.entity).toBe('@instagram/profile')
      expect(frontmatter.urlPattern).toBe('/:handle/')
    })

    it('parses an array value', () => {
      const { frontmatter } = parse(
        'urlPattern = [/:handle/, /p/:id/]\n{ "x": $(h1):text }',
      )
      expect(frontmatter.urlPattern).toEqual(['/:handle/', '/p/:id/'])
    })

    it('trims whitespace from scalar values', () => {
      const { frontmatter } = parse('entity =   @example/page  \n{ "x": $(h1):text }')
      expect(frontmatter.entity).toBe('@example/page')
    })

    it('trims whitespace from array items', () => {
      const { frontmatter } = parse(
        'urlPattern = [ /a/ , /b/ ]\n{ "x": $(h1):text }',
      )
      expect(frontmatter.urlPattern).toEqual(['/a/', '/b/'])
    })

    it('returns empty frontmatter when none present', () => {
      const { frontmatter } = parse('{ "x": $(h1):text }')
      expect(frontmatter).toEqual({})
    })

    it('preserves unknown keys as strings', () => {
      const { frontmatter } = parse('version = 2\n{ "x": $(h1):text }')
      expect(frontmatter.version).toBe('2')
    })
  })

  describe('expr parsing', () => {
    it('parses the expression body after frontmatter', () => {
      const { expr } = parse('entity = @example/page\n{ "name": $(h1):text }')
      expect(expr.kind).toBe('object')
    })

    it('parses the expression body with no frontmatter', () => {
      const { expr } = parse('$(h1):text')
      expect(expr.kind).toBe('pipeline')
    })

    it('parses an array expression body', () => {
      const { expr } = parse('entity = @example/page\n[ $(h1):text ]')
      expect(expr.kind).toBe('array')
    })
  })

  describe('error cases', () => {
    it('throws on invalid expression body', () => {
      expect(() => parse('entity = @example/page\n!!invalid!!')).toThrow()
    })
  })
})
