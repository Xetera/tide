import { Type } from 'typebox'
import { EntityBuilder, One } from '~/site-spec/site-builder'
import { Image, ImageType, Video } from '~/extraction/media-types'

const InstagramImage = Image.offload().ephemeral()
const InstagramVideo = Video.offload().ephemeral()

export const instagramEntities = [
  new EntityBuilder('@instagram/user').fields({
    username: Type.String(),
    nickname: Type.String(),
    profilePic: ImageType,
    followerCount: Type.Integer(),
    followingCount: Type.Integer(),
    postCount: Type.Integer(),
    isPrivate: Type.Boolean(),
    isVerified: Type.Boolean(),
    description: Type.String(),
  }),
  new EntityBuilder('@instagram/post').fields({
    title: Type.String(),
    media: Type.Union([
      Type.Object({ kind: Type.Literal('video'), video: InstagramVideo }),
      Type.Object({
        kind: Type.Literal('carousel'),
        images: Type.Array(InstagramImage.sized()),
      }),
      Type.Object({
        kind: Type.Literal('image'),
        image: InstagramImage.sized(),
      }),
    ]),
    commentsDisabled: Type.Boolean(),
    likeCount: Type.Integer(),
    author: One('@instagram/user'),
  }),
  new EntityBuilder('@instagram/comment').fields({
    text: Type.String(),
    likeCount: Type.Integer(),
    author: One('@instagram/user'),
    post: One('@instagram/post'),
  }),
]
