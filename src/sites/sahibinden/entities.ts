import { Type } from 'typebox'
import { Image } from '~/extraction/media-types'
import { shbdn_image_identity } from '~gleam/media/identity.mjs'
import { EntityBuilder, One } from '~/site-spec/site-builder'

const SahibindenImage = Image.offload().identity({
  fn: shbdn_image_identity,
})

export const sahibindenEntities = [
  new EntityBuilder('@sahibinden/image').fields({
    listingId: One('@sahibinden/listing'),
    image: SahibindenImage,
  }),
  new EntityBuilder('@sahibinden/listing').fields({
    id: Type.String(),
    name: Type.String(),
    price: Type.Optional(Type.Number()),
    description: Type.String(),
    latitude: Type.Optional(Type.Number()),
    longitude: Type.Optional(Type.Number()),
    attributes: Type.Record(Type.String(), Type.String()),
  }),
  new EntityBuilder('@sahibinden/agency').fields({
    name: Type.String(),
    link: Type.String({ format: 'uri' }),
  }),
]
