import { Type } from 'typebox'
import { EntityBuilder, Many, One } from '@tide/spec'
import { Image } from '@tide/spec'

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
    .display('username'),
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
    .display('text'),
]
