import { defineSite } from '~/site-spec/site-builder'
import { funnelProvider } from '~/site-spec/funnel-loader'
import { robloxEntities } from './entities'

export const robloxSite = defineSite({
  dir: 'roblox',
  funnelProvider,
  hostname: 'www.roblox.com',
  entities: robloxEntities,
})

export default robloxSite
