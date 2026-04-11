import { defineSite } from '~/site-spec/site-builder'
import { robloxEntities } from './entities'

export const robloxSite = defineSite({
  dir: 'roblox',
  hostname: 'www.roblox.com',
  entities: robloxEntities,
  requests: {},
})

export default robloxSite
