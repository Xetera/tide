import { describe, expect, it } from 'vitest'
import { parseFrontmatter } from './index'

describe('parseFrontmatter', () => {
  it('parses a scalar value', () => {
    const { frontmatter } = parseFrontmatter(
      '---\nentity: "@instagram/profile"\n---\nbody',
    )
    expect(frontmatter.entity).toBe('@instagram/profile')
  })

  it('parses multiple scalar entries', () => {
    const { frontmatter } = parseFrontmatter(
      '---\nentity: "@instagram/profile"\nurlPattern: "/:handle/"\n---\nbody',
    )
    expect(frontmatter.entity).toBe('@instagram/profile')
    expect(frontmatter.urlPattern).toBe('/:handle/')
  })

  it('parses an array value', () => {
    const { frontmatter } = parseFrontmatter(
      '---\nurlPattern: ["/:handle/", "/p/:id/"]\n---\nbody',
    )
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
    const { body } = parseFrontmatter(
      '---\nentity: "@foo/bar"\n---\nsome content\nmore content',
    )
    expect(body).toBe('some content\nmore content')
  })
})
