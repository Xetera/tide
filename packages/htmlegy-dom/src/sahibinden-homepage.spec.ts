import { describe, it, expect, beforeAll } from 'vitest'
import { createExpr } from './index'
import { parseFrontmatter } from '@tide/frontmatter'
import rawHtmlegySrc from './fixtures/sahibinden-homepage.htmlegy?raw'
import htmlSrc from './fixtures/sahibinden-homepage.html?raw'

const htmlegySrc = parseFrontmatter(rawHtmlegySrc).body

function doc(html: string): Element {
  const d = document.implementation.createHTMLDocument()
  d.documentElement.innerHTML = html
  return d.body
}

type MediaRef = { url: string; dimensions?: { width: number; height: number } }
type ShowcaseListing = { title: string; url: string; image: MediaRef }
type InterestingAd = { title: string; url: string; image: MediaRef }
type RealEstateProject = {
  id: string
  name: string
  url: string
  image: MediaRef
  location: string
  deliveryDate: string
}
type Result = {
  showcase: ShowcaseListing[]
  interestingAds: InterestingAd[]
  realEstateProjects: RealEstateProject[]
}

describe('sahibinden homepage', () => {
  let result: Result

  beforeAll(async () => {
    result = (await createExpr(htmlegySrc).run(doc(htmlSrc))) as Result
  })

  describe('showcase listings', () => {
    it('extracts an array', () => {
      expect(Array.isArray(result.showcase)).toBe(true)
      expect(result.showcase.length).toBeGreaterThan(0)
    })

    it('each item has a non-empty title', () => {
      for (const item of result.showcase) {
        expect(typeof item.title).toBe('string')
        expect(item.title.length).toBeGreaterThan(0)
      }
    })

    it('each item has an absolute url', () => {
      for (const item of result.showcase) {
        expect(item.url).toMatch(/^https?:\/\//)
      }
    })

    it('each item has an image with a url', () => {
      for (const item of result.showcase) {
        expect(typeof item.image?.url).toBe('string')
        expect(item.image.url.length).toBeGreaterThan(0)
      }
    })
  })

  describe('interesting ads', () => {
    it('extracts an array', () => {
      expect(Array.isArray(result.interestingAds)).toBe(true)
      expect(result.interestingAds.length).toBeGreaterThan(0)
    })

    it('each item has a non-empty title', () => {
      for (const item of result.interestingAds) {
        expect(typeof item.title).toBe('string')
        expect(item.title.length).toBeGreaterThan(0)
      }
    })

    it('each item has an absolute url', () => {
      for (const item of result.interestingAds) {
        expect(item.url).toMatch(/^https?:\/\//)
      }
    })

    it('each item has an image with a url', () => {
      for (const item of result.interestingAds) {
        expect(typeof item.image?.url).toBe('string')
        expect(item.image.url.length).toBeGreaterThan(0)
      }
    })
  })

  describe('real estate projects', () => {
    it('extracts an array', () => {
      expect(Array.isArray(result.realEstateProjects)).toBe(true)
      expect(result.realEstateProjects.length).toBeGreaterThan(0)
    })

    it('each project has a non-empty id', () => {
      for (const item of result.realEstateProjects) {
        expect(typeof item.id).toBe('string')
        expect(item.id.length).toBeGreaterThan(0)
      }
    })

    it('each project has a non-empty name', () => {
      for (const item of result.realEstateProjects) {
        expect(typeof item.name).toBe('string')
        expect(item.name.length).toBeGreaterThan(0)
      }
    })

    it('each project has an absolute url', () => {
      for (const item of result.realEstateProjects) {
        expect(item.url).toMatch(/^https?:\/\//)
      }
    })

    it('each project has an image with a url', () => {
      for (const item of result.realEstateProjects) {
        expect(typeof item.image?.url).toBe('string')
        expect(item.image.url.length).toBeGreaterThan(0)
      }
    })

    it('each project has a non-empty location', () => {
      for (const item of result.realEstateProjects) {
        expect(typeof item.location).toBe('string')
        expect(item.location.length).toBeGreaterThan(0)
      }
    })

    it('each project has a delivery date', () => {
      for (const item of result.realEstateProjects) {
        expect(typeof item.deliveryDate).toBe('string')
        expect(item.deliveryDate.length).toBeGreaterThan(0)
      }
    })
  })
})
