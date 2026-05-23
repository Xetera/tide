import { defineSite } from '~/site-spec/site-builder'
import { funnelProvider } from '~/site-spec/funnel-loader'
import { instagramEntities } from './entities'

export const instagramSite = defineSite({
  dir: 'linkedin',
  funnelProvider,
  hostname: 'www.linkedin.com',
  entities: instagramEntities,
})

export default instagramSite
