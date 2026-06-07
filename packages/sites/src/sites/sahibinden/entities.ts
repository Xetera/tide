import { Type } from 'typebox'
import { Image, Money } from '@tide/spec'
import { shbdn_image_identity } from '~gleam/media/identity.mjs'
import { EntityBuilder, One, RichText } from '@tide/spec'

const SahibindenImage = Image.offload().identity({
  fn: shbdn_image_identity,
})

const Breadcrumb = Type.Object({
  id: Type.Optional(Type.String()),
  label: Type.String()
})

const Location = Type.Object({
  city: Type.String(),
  town: Type.String(),
  quarter: Type.Optional(Type.String()),
})

export const sahibindenEntities = [
  new EntityBuilder('@sahibinden/listing').fields({
    id: Type.String(),
    name: Type.String(),
    price: Money,
    agency: One('@sahibinden/agency'),
    location: Location,
    description: RichText,
    latitude: Type.Number(),
    longitude: Type.Number(),
    breadcrumbs: Type.Array(Breadcrumb),
    attributes: Type.Record(Type.String(), Type.String(), {
      description:
        'Sahinbinden has a lot of different attributes for different kinds of listings',
    }),
    images: Type.Array(SahibindenImage),
  }),
  new EntityBuilder('@sahibinden/agency').fields({
    name: Type.String(),
    link: Type.String({ format: 'uri' }),
    logo: SahibindenImage,
  }),
]
