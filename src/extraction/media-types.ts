import { Type } from 'typebox'

export const ImageRef = Type.Object({
  _type: Type.Literal('image'),
  // images and videos may have stable ids scoped under the platform
  // unlike entities, this information is optional as not every image
  // is going to have a known id
  _id: Type.Optional(Type.String()),
  url: Type.String({ format: 'uri' }),
  hash: Type.String(),
  width: Type.Optional(Type.Number()),
  height: Type.Optional(Type.Number()),
})

export const VideoRef = Type.Object({
  _type: Type.Literal('video'),
  _id: Type.Optional(Type.String()),
  url: Type.String({ format: 'uri' }),
  hash: Type.String(),
  width: Type.Optional(Type.Number()),
  height: Type.Optional(Type.Number()),
})

export const MediaRef = Type.Union([ImageRef, VideoRef])
