import { Type } from 'typebox'
import { defineEntity, defineSite } from '~/site-spec/site-builder'
import type { JobParameters } from '~/site-spec/types'

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
  hostname: 'www.sahibinden.com',
  entities: [
    defineEntity('@sahibinden/city_listing', {
      $fields: Type.Object({
        id: Type.String(),
        price: Type.Optional(Type.Number()),
        latitude: Type.Optional(Type.Number()),
        longitude: Type.Optional(Type.Number()),
        agency: Type.Optional(
          Type.Object({
            name: Type.String(),
            link: Type.String({ format: 'uri' }),
          }),
        ),
      }),
    }),
  ],
  requests: {},
})

export default sahibindenSite
