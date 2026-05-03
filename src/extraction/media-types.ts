import { Type, type TObject } from 'typebox'
import type { MediaRecord, IdentityError } from '~gleam/media/identity.mjs'
import type { Result } from '~gleam/gleam.mjs'

export type HashSource =
  | { from: 'header'; header: string; expr: string }
  | { from: 'sibling'; expr: string }
  | { from: 'none' }

export type IdentityFn = (media: MediaRecord) => Result<string, IdentityError>
export type IdentitySource = { fn: IdentityFn }

export const identityRegistry = new Map<string, IdentityFn>()

export type MediaBuilder = TObject & {
  'x-ephemeral'?: { ttl?: number }
  'x-offload'?: boolean
  'x-identity'?: { fn: string }
  'x-hash'?: HashSource
  ephemeral(ttl?: number): MediaBuilder
  offload(): MediaBuilder
  sized(): MediaBuilder
  identity(source: IdentitySource): MediaBuilder
  hash(source: HashSource): MediaBuilder
}

function mergeBuilder(base: MediaBuilder, overrides: object): TObject {
  const merged = Object.assign({}, base, overrides)
  return merged
}

function mediaBuilder(schema: TObject): MediaBuilder {
  const builder: MediaBuilder = {
    ...schema,
    ephemeral(ttl?: number): MediaBuilder {
      return mediaBuilder(mergeBuilder(this, { 'x-ephemeral': { ttl } }))
    },
    offload(): MediaBuilder {
      return mediaBuilder(mergeBuilder(this, { 'x-offload': true }))
    },
    sized(): MediaBuilder {
      return mediaBuilder(
        mergeBuilder(this, {
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
    identity(source: IdentitySource): MediaBuilder {
      identityRegistry.set(source.fn.name, source.fn)
      return mediaBuilder(
        mergeBuilder(this, {
          'x-identity': { fn: source.fn.name },
        }),
      )
    },
    hash(source: HashSource): MediaBuilder {
      return mediaBuilder(mergeBuilder(this, { 'x-hash': source }))
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
  duration: Type.Optional(Type.Number()),
})

export const Image = mediaBuilder(ImageType)
export const Video = mediaBuilder(VideoType)

export const MediaType = Type.Union([ImageType, VideoType])
