import { Type } from 'typebox'
import { EntityBuilder, Many, One } from '~/site-spec/site-builder'
import { Image, ImageType, Video } from '~/extraction/media-types'

const InstagramImage = Image.offload().ephemeral()
const InstagramVideo = Video.offload().ephemeral()

export const instagramEntities = [
  new EntityBuilder('@instagram/user')
    .canonicalUrl('https://instagram.com/{username}')
    .fields({
      username: Type.String(),
      nickname: Type.String(),
      profilePic: ImageType,
      followerCount: Type.Integer(),
      followingCount: Type.Integer(),
      postCount: Type.Integer(),
      isPrivate: Type.Boolean(),
      isVerified: Type.Boolean(),
      bio: Type.String(),
      posts: Many('@instagram/post'),
      bioLinks: Type.Array(
        Type.Object({
          title: Type.String(),
          linkType: Type.String(),
          url: Type.String({ format: 'url' }),
        }),
      ),
    })
    .display('username')
    .version(0),
  new EntityBuilder('@instagram/post')
    .canonicalUrl('https://instagram.com/p/{code}')
    .fields({
      code: Type.String(),
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
    })
    .unique(['code'])
    .display('title'),
  new EntityBuilder('@instagram/comment')
    .fields({
      text: Type.String(),
      likeCount: Type.Integer(),
      author: One('@instagram/user'),
      post: One('@instagram/post'),
    })
    .display('text'),
]
