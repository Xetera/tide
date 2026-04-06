import type { PageSpec } from '~/site-spec/types'

export default {
  $entity: 'roblox:charts',
  $urlPattern: '/charts',
  $waitFor: ["[data-testid='game-tile']"],
  $fields: {
    games: {
      $sourceEach: { $cssEach: "[data-testid='game-tile']" },
      $fields: {
        name: {
          $source: { $css: '[title]' },
          $transform: [
            { $attr: 'title' },
            { $trim: ['outside', 'inside'] },
          ],
        },
        image: {
          $source: { $css: 'img' },
          $ifMissing: { $strategy: 'omit' },
          $transform: [{ $media: { $offload: true } }],
        },
        likePercentage: {
          $source: { $css: "[data-testid='game-tile-stats'] span:nth-child(2)" },
          $transform: [
            { $text: true },
            { $regex: '(\\d+)' },
            { $cast: 'number' },
          ],
        },
        playingCount: {
          $source: { $css: "[data-testid='game-tile-stats'] span:nth-child(4)" },
          $transform: [
            { $text: true },
            { $regex: '([\\d\\.]+K?|M?)' },
            { $expandSuffix: true },
            { $cast: 'number' },
          ],
        },
      },
    },
  },
} satisfies PageSpec
