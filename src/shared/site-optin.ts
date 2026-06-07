import type { SiteSpec } from '@tide/spec'
import { toOrigin } from '@tide/spec'
import { Storage, type BrowserStorageSchema } from '~/shared/storage'

const storage = new Storage<BrowserStorageSchema>()

export async function requestPermission(site: SiteSpec): Promise<boolean> {
  return chrome.permissions.request({ origins: [toOrigin(site)] })
}

export async function revokePermission(site: SiteSpec): Promise<void> {
  await chrome.permissions.remove({ origins: [toOrigin(site)] }).catch(() => {
    console.error('Error removing permissions for', toOrigin(site))
  })
}

export async function addOptedInSite(site: SiteSpec): Promise<string[]> {
  const current = await storage.get('sites:opted-in', [])
  const updated = [...new Set([...current, site.site])]
  await storage.set('sites:opted-in', updated)
  return updated
}

export async function removeOptedInSite(site: SiteSpec): Promise<string[]> {
  const current = await storage.get('sites:opted-in', [])
  const updated = current.filter((s) => s !== site.site)
  await storage.set('sites:opted-in', updated)
  return updated
}
