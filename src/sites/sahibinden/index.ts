import { defineSite } from '~/site-spec/site-builder'
import { funnelProvider } from '~/site-spec/funnel-loader'
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
  id: 'sahibinden',
  funnelProvider,
  hostname: 'www.sahibinden.com',
  entities: sahibindenEntities,
})

export default sahibindenSite
