import type { PageSpec } from '~/site-spec/types'

export default {
  $entity: 'instagram:post',
  $variables: {
    postId: {
      $kind: 'url',
      $description: 'Post id',
    },
    img_index: {
      $kind: 'query',
      $description: 'Index of the carousel image',
    },
  },
  $meta: {
    locale: {
      $source: { $css: 'html' },
      $transform: [{ $attr: 'lang' }, { $fallback: 'en' }],
    },
  },
  $urlPattern: [
    '/p/:postId',
    '/reel/:postId',
    '/:username/p/:postId',
    '/:username/reel/:postId',
  ],
  $waitFor: ['div + hr + div > div', 'ul > div[role=button]'],
  $fields: {
    post: {
      $fields: {
        description: {
          $source: { $css: 'div + hr + div div > span > div > div + span' },
          $transform: [{ $text: true }],
        },
        user: {
          $fields: {
            avatar: {
              $source: { $css: 'div + hr + div a[role=link] img' },
              $transform: [{ $media: {} }],
            },
          },
        },
        location: {
          $source: {
            $css: '[role=presentation] a[href^="/explore/locations"]',
          },
          $ifMissing: {
            $strategy: 'omit',
          },
          $fields: {
            name: {
              $transform: [{ $text: true }],
            },
            link: {
              $transform: [{ $attr: 'href' }, { $cast: 'url' }],
            },
          },
        },
      },
    },
    media: [
      {
        $source: {
          $css: ':is([role=button] video[playsinline], video[src^=blob]:has(+ [data-instancekey]))',
        },
        $fields: {
          type: { $literal: 'video' },
          video: {
            $transform: [{ $media: {} }],
          },
        },
      },
      {
        $source: { $css: '[role=presentation] ul:has(li[tabindex])' },
        $fields: {
          type: { $literal: 'carousel' },
          images: {
            $sourceEach: { $cssEach: 'li[tabindex] img' },
            $transform: [{ $media: {} }],
          },
        },
      },
      {
        $source: { $css: '[role=button][tabindex="-1"] img' },
        $fields: {
          type: { $literal: 'image' },
          image: {
            $transform: [{ $media: {} }],
          },
        },
      },
    ],
    likeCount: [
      {
        $ifMissing: {
          $strategy: 'omit',
        },
        $source: {
          $css: 'span:has([aria-label=Like], [aria-label=Unlike]) + [role=button]',
        },
        $transform: [
          { $text: true },
          { $expandSuffix: true },
          { $cast: 'number' },
        ],
      },
      {
        $source: {
          $css: '[role=presentation] > div > section + section div[role=button] > .html-span',
        },
        $transform: [{ $text: true }, { $cast: 'number' }],
      },
    ],
    comments: {
      $fields: {
        list: {
          $sourceEach: {
            $cssEach: 'ul > div > div > div > div:has(> ul > div[role=button])',
          },
          $fields: {
            username: {
              $source: { $css: 'h3' },
              $transform: [{ $text: true }],
            },
            isVerified: {
              $source: { $css: '[aria-label="Verified"]' },
              $transform: [{ $exists: true }],
            },
            comment: {
              $source: { $css: 'h3 + div' },
              $transform: [{ $text: true }],
            },
            postedAt: {
              $source: { $css: 'time' },
              $transform: [{ $attr: 'datetime' }, { $cast: 'date' }],
            },
            likes: {
              $source: { $css: 'a:has(time) + button' },
              $transform: [
                { $text: true },
                { $regex: '[0-9,.]+' },
                { $cast: 'number' },
              ],
            },
          },
        },
        count: [
          {
            $source: {
              $css: 'span:has([aria-label=Comment]) + [role=button]',
            },
            $fields: {
              tag: { $literal: 'count_enabled' },
              value: {
                $transform: [
                  { $text: true },
                  { $expandSuffix: true },
                  { $cast: 'number' },
                ],
              },
            },
          },
          {
            $fields: {
              tag: { $literal: 'count_disabled' },
            },
          },
        ],
      },
    },
  },
} satisfies PageSpec
