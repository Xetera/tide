import { defineSite } from '@tide/spec'
import { linkedinEntities } from './entities'

export const linkedinSite = defineSite({
  id: 'linkedin',
  hostname: 'www.linkedin.com',
  entities: linkedinEntities,
})

export default linkedinSite
