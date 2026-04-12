import { defineSite } from '~/site-spec/site-builder'
import { loaderEntries } from '~/loaders'
import type { JobParameters } from '~/site-spec/types'
import { sahibindenEntities } from './entities'

export const sahibindenSmallJobs: JobParameters[] = [
  {
    id: '1',
    expires_at: new Date(),
    issued_at: new Date(),
    resource_id: 'sahibinden:city_listing',
    url: 'https://www.sahibinden.com/satilik/istanbul',
  },
]

export const sahibindenSite = defineSite({
  dir: 'sahibinden',
  loaderEntries,
  hostname: 'www.sahibinden.com',
  entities: sahibindenEntities,
  requests: {},
})

export default sahibindenSite
