import { defineSite } from '~/site-spec/site-builder'
import { loaderEntries } from '~/loaders'
import { twitterEntities } from './entities'

export const twitterSite = defineSite({
  dir: 'twitter',
  loaderEntries,
  hostname: 'x.com',
  entities: twitterEntities,
  requests: {
    tweetDetail: {
      method: 'GET',
      url: '/i/api/graphql/*/TweetDetail',
    },
    userByScreenName: {
      method: 'GET',
      url: '/i/api/graphql/*/UserByScreenName',
    },
    userTweets: {
      method: 'GET',
      url: '/i/api/graphql/*/UserTweets',
    },
    homeTimeline: {
      method: 'POST',
      url: '/i/api/graphql/*/HomeTimeline',
    },
    homeTimelineGet: {
      method: 'GET',
      url: '/i/api/graphql/*/HomeTimeline',
    },
    usersByRestIds: {
      method: 'GET',
      url: 'i/api/graphql/*/UsersByRestIds',
    },
  },
})

export default twitterSite
