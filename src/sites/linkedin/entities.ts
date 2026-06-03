import { Type } from 'typebox'
import { EntityBuilder, Many, One, RichText } from '~/funnels/site-builder'
import { Image } from '~/funnels/media-types'

const LinkedinImage = Image.offload().ephemeral()

export const linkedinEntities = [
  new EntityBuilder('@linkedin/user')
    .canonicalUrl('https://www.linkedin.com/in/{username}')
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
  new EntityBuilder('@linkedin/company')
    .canonicalUrl('https://www.linkedin.com/company/{username}')
    .fields({
      username: Type.String(),
      // nickname: Type.String(),
      // profilePic: LinkedinImage,
      // followerCount: Type.Integer(),
      // followingCount: Type.Integer(),
      // postCount: Type.Integer(),
      // isPrivate: Type.Boolean(),
      // isVerified: Type.Boolean(),
      // bio: Type.String(),
      // posts: Many('@linkedin/post'),
      // bioLinks: Type.Array(
      //   Type.Object({
      //     title: Type.String(),
      //     linkType: Type.String(),
      //     url: Type.String({ format: 'url' }),
      //   }),
      // ),
    })
    .display('username')
    .version(0),
  new EntityBuilder('@linkedin/post')
    // .canonicalUrl('https://www.linkedin.com/p/{code}')
    .fields({
      content: RichText,
      // media: Type.Union([
      //   Type.Object({ kind: Type.Literal('video'), video: LinkedinVideo }),
      //   Type.Object({
      //     kind: Type.Literal('carousel'),
      //     images: Type.Array(LinkedinImage.sized()),
      //   }),
      //   Type.Object({
      //     kind: Type.Literal('image'),
      //     image: LinkedinImage.sized(),
      //   }),
      // ]),
      commentsDisabled: Type.Boolean(),
      likeCount: Type.Integer(),
      author: Type.Union([
        Type.Object({ type: Type.Literal('user'), user: One('@linkedin/user') }),
        Type.Object({
          type: Type.Literal('company'),
          company: One('@linkedin/company'),
        }),
      ]),
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
