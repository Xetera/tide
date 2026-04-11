import { Type } from 'typebox'
import { EntityBuilder } from '~/site-spec/site-builder'

export const sahibindenEntities = [
  new EntityBuilder('@sahibinden/city_listing').fields({
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
]
