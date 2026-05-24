import { describe, expect, it } from 'vitest'
import { funnelProvider } from './funnel-loader.node'
import { allSites } from '~/sites'

describe('funnelProvider', () => {
  it('loads network entries', () => {
    const entries = funnelProvider.getEntries().filter((e) => 'expression' in e)
    expect(entries.length).toBeGreaterThan(0)
  })

  it('loads all expected sites', () => {
    const sites = new Set(funnelProvider.getEntries().map((e) => e.site))
    expect(sites).toContain('instagram')
    expect(sites).toContain('sahibinden')
    expect(sites).toContain('twitter')
  })

  describe('buildNetworkFunnels', () => {
    it('builds funnels with valid request matchers for each site', () => {
      for (const site of allSites) {
        const funnels = site.getNetworkFunnels()
        for (const funnel of funnels) {
          expect(funnel.request.url).toBeTruthy()
          expect(['GET', 'POST', 'PUT', 'PATCH', 'DELETE']).toContain(funnel.request.method)
          expect(funnel.hostname).toBe(site.hostname)
          expect(funnel.key).toMatch(/^.+\/.+$/)
        }
      }
    })

    it('loads instagram network funnels', () => {
      const instagram = allSites.find((s) => s.hostname === 'www.instagram.com')!
      const funnels = instagram.getNetworkFunnels()
      expect(funnels.length).toBeGreaterThan(0)
      const names = funnels.map((f) => f.name)
      expect(names).toContain('mediaInfo')
      expect(names).toContain('graphql')
    })

    it('loads twitter network funnels', () => {
      const twitter = allSites.find((s) => s.hostname === 'x.com')!
      const funnels = twitter.getNetworkFunnels()
      expect(funnels.length).toBeGreaterThan(0)
      const names = funnels.map((f) => f.name)
      expect(names).toContain('homeTimeline')
    })
  })

  describe('getPageFunnels', () => {
    it('builds page funnels with valid url patterns for each site', () => {
      for (const site of allSites) {
        for (const funnel of site.getPageFunnels()) {
          expect(funnel.url).toBeTruthy()
          expect(funnel.hostname).toBe(site.hostname)
          expect(funnel.key).toMatch(/^.+\/.+$/)
        }
      }
    })

    it('loads sahibinden page funnels', () => {
      const sahibinden = allSites.find((s) => s.hostname === 'www.sahibinden.com')!
      const funnels = [...sahibinden.getPageFunnels()]
      expect(funnels.length).toBeGreaterThan(0)
      const names = funnels.map((f) => f.name)
      expect(names).toContain('listing')
    })
  })

  describe('paths', () => {
    it('all entry paths are relative to the package root', () => {
      for (const entry of funnelProvider.getEntries()) {
        expect(entry.path).toMatch(/^src\/sites\//)
        expect(entry.path).not.toMatch(/^\//)
        expect(entry.path).not.toMatch(/^\.\./)
      }
    })
  })
})
