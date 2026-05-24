import { defineSite } from '~/site-spec/site-builder'
import { funnelProvider } from '~/site-spec/funnel-loader'
import { instagramEntities } from './entities'

export const instagramSite = defineSite({
  id: 'instagram',
  funnelProvider,
  hostname: 'www.instagram.com',
  entities: instagramEntities,
})

export default instagramSite
