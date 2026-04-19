import { Type, type TObject } from 'typebox'

type MediaBuilder = TObject & {
  'x-ephemeral'?: { ttl?: number }
  'x-offload'?: boolean
  ephemeral(ttl?: number): MediaBuilder
  offload(): MediaBuilder
  sized(): MediaBuilder
}

function mediaBuilder(schema: TObject): MediaBuilder {
  const builder: MediaBuilder = {
    ...schema,
    ephemeral(ttl?: number): MediaBuilder {
      return mediaBuilder(Object.assign({}, this, { 'x-ephemeral': { ttl } }))
    },
    offload(): MediaBuilder {
      return mediaBuilder(Object.assign({}, this, { 'x-offload': true }))
    },
    sized(): MediaBuilder {
      return mediaBuilder(
        Object.assign({}, this, {
          properties: {
            ...this.properties,
            width: Type.Number(),
            height: Type.Number(),
          },
          required: [...(this.required ?? []), 'width', 'height'].filter(
            (v, i, a) => a.indexOf(v) === i,
          ),
        }),
      )
    },
  }
  return builder
}

export const ImageType = Type.Object({
  _type: Type.Literal('image'),
  // images and videos may have stable ids scoped under the platform
  // unlike entities, this information is optional as not every image
  // is going to have a known id
  _id: Type.Optional(Type.String()),
  url: Type.String({ format: 'uri' }),
  width: Type.Optional(Type.Number()),
  height: Type.Optional(Type.Number()),
})

export const VideoType = Type.Object({
  _type: Type.Literal('video'),
  _id: Type.Optional(Type.String()),
  url: Type.String({ format: 'uri' }),
  width: Type.Optional(Type.Number()),
  height: Type.Optional(Type.Number()),
  duration: Type.Optional(Type.Number())
})

export const Image = mediaBuilder(ImageType)
export const Video = mediaBuilder(VideoType)

export const MediaType = Type.Union([ImageType, VideoType])
