import { describe, it, expect, beforeAll } from 'vitest'
import { compile } from '~/htmlevate/compiler'
import htmlevateSrc from './fixtures/sahibinden.htmlevate?raw'
import htmlSrc from './fixtures/sahibinden-test.html?raw'

function doc(html: string): Element {
  const d = document.implementation.createHTMLDocument()
  d.documentElement.innerHTML = html
  return d.body
}

type Entity = Record<string, unknown>

describe('sahibinden listing', () => {
  let entities: Entity[]
  let listing: Entity
  let images: Entity[]

  beforeAll(() => {
    entities = compile(htmlevateSrc, { locale: 'tr' })(doc(htmlSrc)) as Entity[]
    console.dir(entities, { depth: Infinity })
    listing = entities.find((e) => e['_entity'] === '@sahibinden/listing')!
    images = entities.filter((e) => e['_entity'] === '@sahibinden/image')
  })

  it('returns an array of entities', () => {
    expect(Array.isArray(entities)).toBe(true)
    expect(entities.length).toBeGreaterThan(0)
  })

  describe('@sahibinden/listing', () => {
    it('exists', () => {
      expect(listing).toBeDefined()
    })

    it('has a non-empty _id', () => {
      expect(typeof listing['_id']).toBe('string')
      expect((listing['_id'] as string).length).toBeGreaterThan(0)
    })

    it('has a non-empty name', () => {
      expect(typeof listing['name']).toBe('string')
      expect((listing['name'] as string).length).toBeGreaterThan(0)
    })

    it('has price as a number greater than zero', () => {
      expect(typeof listing['price']).toBe('number')
      expect(listing['price'] as number).toBeGreaterThan(0)
    })

    it('has a non-empty description', () => {
      expect(typeof listing['description']).toBe('string')
      expect((listing['description'] as string).length).toBeGreaterThan(0)
    })

    it('has attributes as a non-array object', () => {
      expect(listing['attributes']).toBeTruthy()
      expect(typeof listing['attributes']).toBe('object')
      expect(Array.isArray(listing['attributes'])).toBe(false)
    })

    it('has numeric latitude and longitude when map is present', () => {
      if (listing['latitude'] !== undefined) {
        expect(typeof listing['latitude']).toBe('number')
        expect(typeof listing['longitude']).toBe('number')
      }
    })
  })

  describe('@sahibinden/image', () => {
    it('each image has _id, listingId, and image url', () => {
      for (const img of images) {
        expect(img['_id']).toBeTruthy()
        expect(img['listingId']).toBeTruthy()
        expect(img['listingId']).toBe(listing['_id'])
        expect(img['image']).toBeTruthy()
      }
    })
  })
})
