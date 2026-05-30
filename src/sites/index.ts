/// <reference types="vite/client" />
import type { SiteDefinition } from '~/funnels/types'

const siteModules = import.meta.glob('./*/index.ts', {
  import: 'default',
  eager: true,
}) as Record<string, SiteDefinition>

export const allSites: SiteDefinition[] = Object.values(siteModules)
