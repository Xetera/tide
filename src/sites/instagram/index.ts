import { defineSite } from '~/site-spec/site-builder'
import { instagramEntities } from './entities'

export const instagramSite = defineSite({
  dir: 'instagram',
  hostname: 'www.instagram.com',
  entities: instagramEntities,
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
    explorePage: {
      method: 'GET',
      url: '/api/v1/discover/web/explore_grid/',
    },
  },
})

export default instagramSite
