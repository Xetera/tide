import { defineSite } from '~/site-spec/site-builder'
import { loaderEntries } from '~/loaders'
import { robloxEntities } from './entities'

export const robloxSite = defineSite({
  dir: 'roblox',
  loaderEntries,
  hostname: 'www.roblox.com',
  entities: robloxEntities,
  requests: {},
})

export default robloxSite
