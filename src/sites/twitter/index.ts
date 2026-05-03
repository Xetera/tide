import { defineSite } from '~/site-spec/site-builder'
import { funnelProvider } from '~/site-spec/funnel-loader'
import { twitterEntities } from './entities'

export const twitterSite = defineSite({
  dir: 'twitter',
  funnelProvider,
  hostname: 'x.com',
  entities: twitterEntities,
})

export default twitterSite
