import { Type } from 'typebox'
import { defineEntity, defineSite } from '~/site-spec/site-builder'
import { ImageRef, VideoRef } from '~/extraction/media-types'

export const instagramSite = defineSite({
  dir: 'instagram',
  hostname: 'www.instagram.com',
  entities: [
    defineEntity('@instagram/user', {
      $fields: Type.Object({
        username: Type.String(),
        nickname: Type.String(),
        profilePic: ImageRef,
        followerCount: Type.Integer(),
        followingCount: Type.Integer(),
        postCount: Type.Integer(),
        isPrivate: Type.Boolean(),
        isVerified: Type.Boolean(),
        description: Type.String(),
      }),
    }),
    defineEntity('@instagram/post', {
      $fields: Type.Object({
        title: Type.String(),
        media: Type.Union([
          Type.Object({ kind: Type.Literal('video'), video: VideoRef }),
          Type.Object({
            kind: Type.Literal('carousel'),
            images: Type.Array(ImageRef),
          }),
          Type.Object({ kind: Type.Literal('image'), image: ImageRef }),
        ]),
        commentsDisabled: Type.Boolean(),
        likeCount: Type.Integer(),
      }),
      $relationships: {
        author: { $entity: '@instagram/user', $cardinality: 'one' },
        likedBy: { $entity: '@instagram/user', $cardinality: 'many' },
      },
    }),
    defineEntity('@instagram/comment', {
      $fields: Type.Object({
        text: Type.String(),
        media: Type.Union([
          Type.Object({ kind: Type.Literal('video'), video: VideoRef }),
          Type.Object({
            kind: Type.Literal('carousel'),
            images: Type.Array(ImageRef),
          }),
          Type.Object({ kind: Type.Literal('image'), image: ImageRef }),
        ]),
        commentsDisabled: Type.Boolean(),
        likeCount: Type.Integer(),
      }),
      $relationships: {
        author: { $entity: '@instagram/user', $cardinality: 'one' },
        post: { $entity: '@instagram/post', $cardinality: 'one' },
      },
    }),
  ],
  requests: {
    mediaInfo: {
      method: 'GET',
      url: '/api/v1/media/*/info/',
    },
    comments: {
      method: 'GET',
      url: '/api/v1/media/*/comments/',
    },
    graphql: {
      method: 'POST',
      url: '/graphql/query',
    },
  },
})

export default instagramSite
