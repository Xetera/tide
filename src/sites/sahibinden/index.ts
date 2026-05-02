import { defineSite } from '~/site-spec/site-builder'
import { loaderProvider } from '~/loaders'
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
  loaderProvider,
  hostname: 'www.sahibinden.com',
  entities: sahibindenEntities,
  requests: {
    map: {
      url: '/ajax/mapSearch/classified/markers',
      method: 'GET',
    },
    mapHover: {
      url: '/ajax/mapSearch/classified/markers/*',
      method: 'GET',
    },
  },
})

export default sahibindenSite
