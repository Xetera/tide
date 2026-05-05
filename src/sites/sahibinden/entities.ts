import { Type } from 'typebox'
import { Image } from '~/extraction/media-types'
import { shbdn_image_identity } from '~gleam/media/identity.mjs'
import { EntityBuilder } from '~/site-spec/site-builder'

const SahibindenImage = Image.offload().identity({
  fn: shbdn_image_identity,
})

export const sahibindenEntities = [
  new EntityBuilder('@sahibinden/listing').fields({
    id: Type.String(),
    name: Type.String(),
    price: Type.Number(),
    description: Type.String(),
    latitude: Type.Number(),
    longitude: Type.Number(),
    attributes: Type.Record(Type.String(), Type.String()),
    images: Type.Array(SahibindenImage),
  }).jsonLd({
    '@type': 'RealEstateListing',
    identifier: 'id',
    name: 'name',
    description: 'description',
    url: 'canonicalUrl',
    price: 'price',
  }),
  new EntityBuilder('@sahibinden/agency').fields({
    name: Type.String(),
    link: Type.String({ format: 'uri' }),
    logo: SahibindenImage,
  }).jsonLd({
    '@type': 'RealEstateAgent',
    name: 'name',
    url: 'link',
  }),
]
