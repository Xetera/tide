import { defineSite } from '~/funnels/site-builder'
import { robloxEntities } from './entities'

export const robloxSite = defineSite({
  id: 'roblox',
  hostname: 'www.roblox.com',
  entities: robloxEntities,
})

export default robloxSite
