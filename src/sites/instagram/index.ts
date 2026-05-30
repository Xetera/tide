import { defineSite } from '~/funnels/site-builder'
import { instagramEntities } from './entities'

export const instagramSite = defineSite({
  id: 'instagram',
  hostname: 'www.instagram.com',
  entities: instagramEntities,
})

export default instagramSite
