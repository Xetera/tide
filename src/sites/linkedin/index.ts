import { defineSite } from '~/site-spec/site-builder'
import { instagramEntities } from './entities'

export const instagramSite = defineSite({
  id: 'linkedin',
  hostname: 'www.linkedin.com',
  entities: instagramEntities,
})

export default instagramSite
