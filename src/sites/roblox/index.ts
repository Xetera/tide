import { Type } from 'typebox'
import { defineEntity, defineSite } from '~/site-spec/site-builder'

export const robloxSite = defineSite({
  dir: 'roblox',
  hostname: 'www.roblox.com',
  entities: [
    defineEntity('@roblox/game', {
      $fields: Type.Object({
        name: Type.String(),
        image: Type.Optional(Type.String({ format: 'uri' })),
        likePercentage: Type.Optional(Type.Number()),
        playingCount: Type.Optional(Type.Number()),
      }),
    }),
  ],
  requests: {},
})

export default robloxSite
