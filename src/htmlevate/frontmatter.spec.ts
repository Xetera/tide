import { describe, expect, it } from 'vitest'
import { parseWithFrontmatter } from '~/htmlevate/parser'

describe('parseWithFrontmatter', () => {
  describe('frontmatter parsing', () => {
    it('parses a scalar value', () => {
      const { frontmatter } = parseWithFrontmatter('entity = @instagram/profile\n{ "x": $(h1):text }')
      expect(frontmatter.entity).toBe('@instagram/profile')
    })

    it('parses multiple scalar entries', () => {
      const { frontmatter } = parseWithFrontmatter(
        'entity = @instagram/profile\nurlPattern = /:handle/\n{ "x": $(h1):text }',
      )
      expect(frontmatter.entity).toBe('@instagram/profile')
      expect(frontmatter.urlPattern).toBe('/:handle/')
    })

    it('parses an array value', () => {
      const { frontmatter } = parseWithFrontmatter(
        'urlPattern = [/:handle/, /p/:id/]\n{ "x": $(h1):text }',
      )
      expect(frontmatter.urlPattern).toEqual(['/:handle/', '/p/:id/'])
    })

    it('trims whitespace from scalar values', () => {
      const { frontmatter } = parseWithFrontmatter('entity =   @example/page  \n{ "x": $(h1):text }')
      expect(frontmatter.entity).toBe('@example/page')
    })

    it('trims whitespace from array items', () => {
      const { frontmatter } = parseWithFrontmatter(
        'urlPattern = [ /a/ , /b/ ]\n{ "x": $(h1):text }',
      )
      expect(frontmatter.urlPattern).toEqual(['/a/', '/b/'])
    })

    it('returns empty frontmatter when none present', () => {
      const { frontmatter } = parseWithFrontmatter('{ "x": $(h1):text }')
      expect(frontmatter).toEqual({})
    })

    it('preserves unknown keys as strings', () => {
      const { frontmatter } = parseWithFrontmatter('version = 2\n{ "x": $(h1):text }')
      expect(frontmatter.version).toBe('2')
    })
  })

  describe('expr parsing', () => {
    it('parses the expression body after frontmatter', () => {
      const { expr } = parseWithFrontmatter('entity = @example/page\n{ "name": $(h1):text }')
      expect(expr.kind).toBe('object')
    })

    it('parses the expression body with no frontmatter', () => {
      const { expr } = parseWithFrontmatter('$(h1):text')
      expect(expr.kind).toBe('pipeline')
    })

    it('parses an array expression body', () => {
      const { expr } = parseWithFrontmatter('entity = @example/page\n[ $(h1):text ]')
      expect(expr.kind).toBe('array')
    })
  })

  describe('error cases', () => {
    it('throws on invalid expression body', () => {
      expect(() => parseWithFrontmatter('entity = @example/page\n!!invalid!!')).toThrow()
    })
  })
})
