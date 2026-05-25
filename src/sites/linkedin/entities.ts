import { Type } from 'typebox'
import { EntityBuilder, Many, One, RichText } from '~/site-spec/site-builder'
import { Image, Video } from '~/extraction/media-types'

const LinkedinImage = Image.offload().ephemeral()

const LinkedinVideo = Video.offload().ephemeral()

export const instagramEntities = [
  new EntityBuilder('@linkedin/user')
    .canonicalUrl('https://www.linkedin.com/{username}')
    .fields({
      username: Type.String(),
      nickname: Type.String(),
      profilePic: LinkedinImage,
      followerCount: Type.Integer(),
      followingCount: Type.Integer(),
      postCount: Type.Integer(),
      isPrivate: Type.Boolean(),
      isVerified: Type.Boolean(),
      bio: Type.String(),
      posts: Many('@linkedin/post'),
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
  new EntityBuilder('@linkedin/post')
    .canonicalUrl('https://www.linkedin.com/p/{code}')
    .fields({
      code: Type.String(),
      title: Type.String(),
      content: RichText,
      media: Type.Union([
        Type.Object({ kind: Type.Literal('video'), video: LinkedinVideo }),
        Type.Object({
          kind: Type.Literal('carousel'),
          images: Type.Array(LinkedinImage.sized()),
        }),
        Type.Object({
          kind: Type.Literal('image'),
          image: LinkedinImage.sized(),
        }),
      ]),
      commentsDisabled: Type.Boolean(),
      likeCount: Type.Integer(),
      author: One('@linkedin/user'),
    })
    .unique(['code'])
    .display('title'),
  new EntityBuilder('@linkedin/comment')
    .fields({
      text: Type.String(),
      likeCount: Type.Integer(),
      author: One('@linkedin/user'),
      post: One('@linkedin/post'),
    })
    .display('text'),
]
