import { Type } from 'typebox'
import { EntityBuilder } from '~/site-spec/site-builder'

export const robloxEntities = [
  new EntityBuilder('@roblox/game').fields({
    name: Type.String(),
    image: Type.Optional(Type.String({ format: 'uri' })),
    likePercentage: Type.Optional(Type.Number()),
    playingCount: Type.Optional(Type.Number()),
  }).jsonLd({
    '@type': 'VideoGame',
    identifier: '_id',
    name: 'name',
    interactionStatistic: [
      {
        '@type': 'InteractionCounter',
        interactionType: 'https://schema.org/PlayGameAction',
        userInteractionCount: 'playingCount',
      },
    ],
  }),
]
