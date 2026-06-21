import { describe, expect, it } from 'vitest'
import { EntityValidator } from './entity-validator'
import { EntityBuilder, defineSite, resolveCanonicalUrl } from './site-builder'
import { Type } from 'typebox'
import type { EntityPatch } from './types'

const site = defineSite({
  hostname: 'instagram.com',
  id: 'instagram',
  entities: [
    new EntityBuilder('@instagram/post')
      .canonicalUrl('https://instagram.com/p/{code}')
      .fields({ code: Type.String() })
      .unique(['code']),
    new EntityBuilder('@instagram/comment')
      .fields({ text: Type.String() }),
  ],
})

const validator = new EntityValidator([site])

function patch(data: Record<string, unknown>): EntityPatch {
  return data as unknown as EntityPatch
}

describe('resolveCanonicalUrl', () => {
  it('substitutes patch fields into the template', () => {
    expect(
      resolveCanonicalUrl('https://instagram.com/p/{code}', patch({
        _entity: '@instagram/post',
        _id: 'abc',
        code: 'abc',
      })),
    ).toBe('https://instagram.com/p/abc')
  })

  it('resolves {id} from _id', () => {
    expect(
      resolveCanonicalUrl('https://x.com/i/{id}', patch({
        _entity: '@x/post',
        _id: '123',
      })),
    ).toBe('https://x.com/i/123')
  })

  it('uses the first element of a composite _id', () => {
    expect(
      resolveCanonicalUrl('https://x.com/i/{id}', patch({
        _entity: '@x/post',
        _id: ['123', '456'],
      })),
    ).toBe('https://x.com/i/123')
  })

  it('returns null when a referenced field is missing', () => {
    expect(
      resolveCanonicalUrl('https://instagram.com/p/{code}', patch({
        _entity: '@instagram/post',
        _id: 'abc',
      })),
    ).toBeNull()
  })
})

describe('EntityValidator.applyCanonicalUrls', () => {
  it('populates _url for entities with a canonical url template', () => {
    const result = validator.applyCanonicalUrls([
      patch({ _entity: '@instagram/post', _id: 'abc', code: 'abc' }),
    ])[0]!
    expect(result._url).toBe('https://instagram.com/p/abc')
  })

  it('leaves _url unset for entities without a template', () => {
    const result = validator.applyCanonicalUrls([
      patch({ _entity: '@instagram/comment', _id: 'c1', text: 'hi' }),
    ])[0]!
    expect(result._url).toBeUndefined()
  })

  it('leaves _url unset when the template cannot be fully resolved', () => {
    const result = validator.applyCanonicalUrls([
      patch({ _entity: '@instagram/post', _id: 'abc' }),
    ])[0]!
    expect(result._url).toBeUndefined()
  })

  it('does not overwrite an existing _url', () => {
    const result = validator.applyCanonicalUrls([
      patch({
        _entity: '@instagram/post',
        _id: 'abc',
        code: 'abc',
        _url: 'https://instagram.com/p/override',
      }),
    ])[0]!
    expect(result._url).toBe('https://instagram.com/p/override')
  })
})
