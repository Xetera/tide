import { Type } from 'typebox'
import { EntityBuilder } from '~/funnels/site-builder'

export const robloxEntities = [
  new EntityBuilder('@roblox/game').fields({
    name: Type.String(),
    image: Type.Optional(Type.String({ format: 'uri' })),
    likePercentage: Type.Optional(Type.Number()),
    playingCount: Type.Optional(Type.Number()),
  }),
]
