import { defineSite } from '~/site-spec/site-builder'
import { linkedinEntities } from './entities'

export const linkedinSite = defineSite({
  id: 'linkedin',
  hostname: 'www.linkedin.com',
  entities: linkedinEntities,
})

export default linkedinSite
