import { defineSite } from '@tide/spec'
import { twitterEntities } from './entities'

export const twitterSite = defineSite({
  id: 'twitter',
  hostname: 'x.com',
  entities: twitterEntities,
})

export default twitterSite
