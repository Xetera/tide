import { defineSite } from '@tide/spec'
import type { JobParameters } from '@tide/spec'
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
  id: 'sahibinden',
  hostname: 'www.sahibinden.com',
  entities: sahibindenEntities,
})

export default sahibindenSite
