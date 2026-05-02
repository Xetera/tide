import { defineSite } from '~/site-spec/site-builder'
import { loaderProvider } from '~/loaders'
import { robloxEntities } from './entities'

export const robloxSite = defineSite({
  dir: 'roblox',
  loaderProvider,
  hostname: 'www.roblox.com',
  entities: robloxEntities,
  requests: {},
})

export default robloxSite
