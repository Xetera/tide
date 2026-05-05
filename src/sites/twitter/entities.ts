import { Type } from 'typebox'
import { EntityBuilder, Many, One } from '~/site-spec/site-builder'
import { Image } from '~/extraction/media-types'

const TwitterImage = Image.offload().ephemeral()

export const twitterEntities = [
  new EntityBuilder('@twitter/user')
    .canonicalUrl('https://x.com/{username}')
    .fields({
      username: Type.String(),
      nickname: Type.String(),
      profilePic: TwitterImage,
      followerCount: Type.Integer(),
      followingCount: Type.Integer(),
      tweetCount: Type.Integer(),
      isVerified: Type.Boolean(),
      isProtected: Type.Boolean(),
      bio: Type.String(),
    })
    .display('username')
    .jsonLd({
      '@type': 'Person',
      identifier: '_id',
      name: 'nickname',
      alternateName: 'username',
      description: 'bio',
      url: 'canonicalUrl',
      interactionStatistic: [
        {
          '@type': 'InteractionCounter',
          interactionType: 'https://schema.org/FollowAction',
          userInteractionCount: 'followerCount',
        },
      ],
    }),
  new EntityBuilder('@twitter/tweet')
    .canonicalUrl('https://x.com/{authorUsername}/status/{id}')
    .fields({
      text: Type.String(),
      likeCount: Type.Integer(),
      retweetCount: Type.Integer(),
      replyCount: Type.Integer(),
      viewCount: Type.Integer(),
      author: One('@twitter/user'),
      quotedTweet: One('@twitter/tweet'),
      inReplyTo: One('@twitter/tweet'),
      replies: Many('@twitter/tweet'),
    })
    .display('text')
    .jsonLd({
      '@type': 'SocialMediaPosting',
      identifier: '_id',
      text: 'text',
      url: 'canonicalUrl',
      interactionStatistic: [
        {
          '@type': 'InteractionCounter',
          interactionType: 'https://schema.org/LikeAction',
          userInteractionCount: 'likeCount',
        },
        {
          '@type': 'InteractionCounter',
          interactionType: 'https://schema.org/ShareAction',
          userInteractionCount: 'retweetCount',
        },
        {
          '@type': 'InteractionCounter',
          interactionType: 'https://schema.org/ReplyAction',
          userInteractionCount: 'replyCount',
        },
      ],
    }),
]
