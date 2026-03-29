import { PageSpec } from '~/protocol/scrapeer'

export const robloxCharts: PageSpec = {
  $id: 'roblox-charts-page',
  $hostname: 'www.roblox.com',
  $entity: 'roblox:charts',
  $urlPattern: '/charts',
  $waitFor: ["div[data-testid='game-carousel']"],
  $hash: 'v3',
  $fields: {
    categories: {
      $selectorEach: '.games-list-container',
      $fields: {
        title: {
          $selector: '.sort-header',
          $extractor: {
            $extractor: 'text',
            $transformers: [
              {
                $transformer: 'trim',
                $options: ['outside'],
              },
            ],
          },
        },
        games: {
          $selectorEach: "div[data-testid='game-tile']",
          $fields: {
            universeId: {
              $selector: 'a',
              $extractor: {
                $extractor: 'attribute',
                $attribute: 'id',
              },
            },
            link: {
              $selector: '.game-card-link',
              $extractor: { $extractor: 'attribute', $attribute: 'href' },
            },
            placeId: {
              $selector: 'a',
              $extractor: {
                $extractor: 'attribute',
                $attribute: 'href',
                $transformers: [
                  {
                    $transformer: 'regex',
                    $regex: '/games/(\\d+)/',
                    $group: 1,
                  },
                ],
              },
            },
            name: {
              $selector: 'div[title]',
              $extractor: {
                $extractor: 'text',
                $transformers: [
                  {
                    $transformer: 'trim',
                    $options: ['outside'],
                  },
                ],
              },
            },
            thumbnailUrl: {
              $selector: 'img',
              $ifMissing: {
                $strategy: 'omit',
              },
              $extractor: {
                $extractor: 'media',
              },
            },
            rating: {
              $selector: "div[data-testid='game-tile-stats'] span:nth-child(2)",
              $extractor: {
                $extractor: 'text',
                $transformers: [
                  {
                    $transformer: 'regex',
                    $regex: '(\\d+)%',
                    $group: 1,
                  },
                  {
                    $transformer: 'cast',
                    $cast: 'number',
                  },
                ],
              },
            },
            playerCount: {
              $selector: "div[data-testid='game-tile-stats'] span:nth-child(4)",
              $extractor: {
                $extractor: 'text',
                $transformers: [
                  {
                    $transformer: 'expand-suffix',
                  },
                  {
                    $transformer: 'cast',
                    $cast: 'number',
                  },
                ],
              },
            },
          },
        },
      },
    },
  },
}
