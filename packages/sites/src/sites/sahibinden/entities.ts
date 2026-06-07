import { Type } from 'typebox'
import { Image, Money } from '@tide/spec'
import { shbdnImageIdentity } from './identity'
import { EntityBuilder, One, RichText } from '@tide/spec'

const SahibindenImage = Image.offload().identity({
  fn: shbdnImageIdentity,
})

const Breadcrumb = Type.Object({
  id: Type.Optional(Type.String()),
  label: Type.String(),
})

const Location = Type.Object({
  city: Type.String(),
  town: Type.String(),
  quarter: Type.Optional(Type.String()),
})

const SharedFields = {
  price: Money,
  location: Location,
  description: RichText,
  agency: One('@sahibinden/agency'),
  attributes: Type.Record(Type.String(), Type.String(), {
    description:
      'Sahinbinden has a lot of different attributes for different kinds of listings',
  }),
  breadcrumbs: Type.Array(Breadcrumb),
  latitude: Type.Number(),
  longitude: Type.Number(),
} satisfies FieldInput

export const sahibindenEntities = [
  new EntityBuilder('@sahibinden/real_estate').fields({
    ...SharedFields,
    isFeatured: Type.Boolean(),
  }),
  new EntityBuilder('@sahibinden/vehicle').fields({
    ...SharedFields,
  }),
  new EntityBuilder('@sahibinden/job_listing').fields({
    ...SharedFields,
  }),
  new EntityBuilder('@sahibinden/accessories').fields({
    ...SharedFields,
  }),
  // generic?
  new EntityBuilder('@sahibinden/listing').fields({
    ...SharedFields,
  }),
  new EntityBuilder('@sahibinden/agency').fields({
    name: Type.String(),
    link: Type.String({ format: 'uri' }),
    logo: SahibindenImage,
  }),
]
