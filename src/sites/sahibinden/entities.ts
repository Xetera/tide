import { Type } from 'typebox'
import { Image } from '~/extraction/media-types'
import { shbdn_image_identity } from '~gleam/media/identity.mjs'
import { EntityBuilder, One, RichText } from '~/site-spec/site-builder'

const SahibindenImage = Image.offload().identity({
  fn: shbdn_image_identity,
})

const Location = Type.Object({
  city: Type.String(),
  district: Type.String(),
  neighborhood: Type.Optional(Type.String()),
})

export const sahibindenEntities = [
  new EntityBuilder('@sahibinden/listing').fields({
    id: Type.String(),
    name: Type.String(),
    price: Type.Number(),
    agency: One('@sahibinden/agency'),
    location: Location,
    description: RichText,
    latitude: Type.Number(),
    longitude: Type.Number(),
    attributes: Type.Record(Type.String(), Type.String()),
    images: Type.Array(SahibindenImage),
  }),
  new EntityBuilder('@sahibinden/agency').fields({
    name: Type.String(),
    link: Type.String({ format: 'uri' }),
    logo: SahibindenImage,
  }),
]
