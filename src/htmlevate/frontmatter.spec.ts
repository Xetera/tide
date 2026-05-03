import { describe, expect, it } from 'vitest'
import { parse, parseFrontmatter } from '~/htmlevate/parser'

describe('parseFrontmatter', () => {
  it('parses a scalar value', () => {
    const { frontmatter } = parseFrontmatter('---\nentity: "@instagram/profile"\n---\nbody')
    expect(frontmatter.entity).toBe('@instagram/profile')
  })

  it('parses multiple scalar entries', () => {
    const { frontmatter } = parseFrontmatter('---\nentity: "@instagram/profile"\nurlPattern: "/:handle/"\n---\nbody')
    expect(frontmatter.entity).toBe('@instagram/profile')
    expect(frontmatter.urlPattern).toBe('/:handle/')
  })

  it('parses an array value', () => {
    const { frontmatter } = parseFrontmatter('---\nurlPattern: ["/:handle/", "/p/:id/"]\n---\nbody')
    expect(frontmatter.urlPattern).toEqual(['/:handle/', '/p/:id/'])
  })

  it('parses a numeric value as a number', () => {
    const { frontmatter } = parseFrontmatter('---\nversion: 2\n---\nbody')
    expect(frontmatter.version).toBe(2)
  })

  it('returns empty frontmatter when none present', () => {
    const { frontmatter, body } = parseFrontmatter('{ "x": 1 }')
    expect(frontmatter).toEqual({})
    expect(body).toBe('{ "x": 1 }')
  })

  it('returns body after frontmatter block', () => {
    const { body } = parseFrontmatter('---\nentity: "@foo/bar"\n---\nsome content\nmore content')
    expect(body).toBe('some content\nmore content')
  })
})

describe('parse', () => {
  describe('frontmatter parsing', () => {
    it('parses a scalar value', () => {
      const { frontmatter } = parse('---\nentity: "@instagram/profile"\n---\n{ "x": $(h1):text }')
      expect(frontmatter.entity).toBe('@instagram/profile')
    })

    it('parses multiple scalar entries', () => {
      const { frontmatter } = parse(
        '---\nentity: "@instagram/profile"\nurlPattern: "/:handle/"\n---\n{ "x": $(h1):text }',
      )
      expect(frontmatter.entity).toBe('@instagram/profile')
      expect(frontmatter.urlPattern).toBe('/:handle/')
    })

    it('parses an array value', () => {
      const { frontmatter } = parse(
        '---\nurlPattern: ["/:handle/", "/p/:id/"]\n---\n{ "x": $(h1):text }',
      )
      expect(frontmatter.urlPattern).toEqual(['/:handle/', '/p/:id/'])
    })

    it('returns empty frontmatter when none present', () => {
      const { frontmatter } = parse('{ "x": $(h1):text }')
      expect(frontmatter).toEqual({})
    })
  })

  describe('expr parsing', () => {
    it('parses the expression body after frontmatter', () => {
      const { expr } = parse('---\nentity: "@example/page"\n---\n{ "name": $(h1):text }')
      expect(expr.kind).toBe('object')
    })

    it('parses the expression body with no frontmatter', () => {
      const { expr } = parse('$(h1):text')
      expect(expr.kind).toBe('pipeline')
    })

    it('parses an array expression body', () => {
      const { expr } = parse('---\nentity: "@example/page"\n---\n[ $(h1):text ]')
      expect(expr.kind).toBe('array')
    })
  })

  describe('error cases', () => {
    it('throws on invalid expression body', () => {
      expect(() => parse('---\nentity: "@example/page"\n---\n!!invalid!!')).toThrow()
    })
  })
})
