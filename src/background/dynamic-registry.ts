import type { PageSpec } from '~/protocol/scrapeer'
import script from '../content-scripts/spatula?script'
import { toOrigin } from '~/protocol/resource'

export class ScriptRegistry {
  constructor(private resources: PageSpec[]) {}
  static async loadFromResources(
    resources: PageSpec[],
  ): Promise<ScriptRegistry> {
    const { origins = [] } = await chrome.permissions.getAll()
    const scripts: chrome.scripting.RegisteredContentScript[] = resources
      .filter((resource) => origins.includes(toOrigin(resource)))
      .map((resource) => {
        return {
          id: resource.$id,
          matchOriginAsFallback: true,
          persistAcrossSessions: false,
          matches: [toOrigin(resource)],
          js: [script],
          runAt: 'document_idle',
          world: 'ISOLATED',
        } as const
      })
    await chrome.scripting.registerContentScripts(scripts)
    return new ScriptRegistry(resources)
  }
}

export interface UserResource {
  allowed(): Promise<boolean>
  resource: PageSpec
}
