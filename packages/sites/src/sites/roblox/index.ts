import { defineSite } from '@tide/spec'
import { robloxEntities } from './entities'

export const robloxSite = defineSite({
  id: 'roblox',
  hostname: 'www.roblox.com',
  entities: robloxEntities,
})

export default robloxSite
