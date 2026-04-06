import type { PageSpec } from '~/site-spec/types'

export default {
  $entity: 'instagram:profile',
  $variables: {
    profile: {
      $kind: 'url',
      $description: 'Instagram handle',
    },
  },
  $gone: {
    $xpath: `//main//*[contains(text(), "The link you followed may be broken, or the page may have been removed.")]`,
  },
  $meta: {
    locale: {
      $source: { $css: 'html' },
      $transform: [{ $attr: 'lang' }, { $fallback: 'en' }],
    },
  },
  $waitFor: ['header + div + div a:has(img)'],
  $urlPattern: '/:profile/',
  $fields: {
    postCount: {
      $source: {
        $css: 'section:has(canvas, img) + section div:last-child:nth-child(3) :nth-child(1) .html-span',
      },
      $ifMissing: { $strategy: 'omit' },
      $transform: [
        { $text: true },
        { $expandSuffix: true },
        { $cast: 'number' },
      ],
    },
    followerCount: {
      // Expanded extractor <span title="123,123,123">
      $source: {
        $css: 'section:has(canvas, img) + section a[href$="/followers/"] span[title]',
      },
      $ifMissing: { $strategy: 'omit' },
      $transform: [
        { $attr: 'title' },
        { $expandSuffix: true },
        { $cast: 'number' },
      ],
    },
    followingCount: {
      $source: {
        $css: 'section:has(canvas, img) + section a[href$="/following/"] > span > span > span',
      },
      $ifMissing: { $strategy: 'omit' },
      $transform: [
        { $text: true },
        { $expandSuffix: true },
        { $cast: 'number' },
      ],
    },
    nickname: {
      $source: { $css: 'section:has(canvas, img) + section div > span' },
      $transform: [{ $text: true }],
    },
    isVerified: {
      $source: {
        $css: 'section:has(canvas, img) + section [aria-label=Verified]',
      },
      $transform: [{ $exists: true }],
    },
    description: {
      $source: {
        $css: 'section:has(canvas, img) + section > :nth-child(2) > div span',
      },
      $ifMissing: {
        $strategy: 'fallback',
        $value: { $literal: '' },
      },
      $transform: [{ $text: true }],
    },
    profilePicture: {
      $source: { $css: 'header img[alt*="profile picture"]' },
      $ifMissing: { $strategy: 'omit' },
      $transform: [{ $media: {} }],
    },
    posts: {
      $sourceEach: {
        $cssEach:
          'header + div + div > div > div a:has(img:not([alt$="profile picture"]))',
      },
      $entity: 'instagram:post',
      // $ifMissing: { $strategy: 'bail',
      //   $warning: 'Could not find posts array' },
      $fields: {
        isPinned: {
          $source: { $css: '[aria-label="Pinned post icon"]' },
          $transform: [{ $exists: true }],
        },
        kind: [
          {
            $source: { $css: '[aria-label=Carousel]' },
            $literal: 'carousel',
          },
          {
            $source: { $css: '[aria-label=Clip]' },
            $literal: 'clip',
          },
          {
            $match: {
              $css: '[aria-label!="Pinned post icon"]',
            },
            $literal: 'image',
          },
          {
            $literal: null,
          },
        ],
        link: {
          $transform: [{ $attr: 'href' }, { $cast: 'url' }],
        },
        preview: {
          $source: { $css: 'img' },
          $ifMissing: {
            $strategy: 'omit',
            $warning: 'image not found in post?',
          },
          $transform: [{ $media: {} }],
        },
        alt: {
          $source: { $css: 'img' },
          $ifMissing: {
            $strategy: 'omit',
            $warning: 'image not found in post?',
          },
          $transform: [{ $attr: 'alt' }],
        },
      },
    },
    stories: {
      $sourceEach: { $cssEach: `a[href^="/stories/"]` },
      $ifMissing: {
        $strategy: 'omit',
      },
      $fields: {
        link: {
          $transform: [{ $attr: 'href' }, { $cast: 'url' }],
        },
        coverImage: {
          $source: { $css: 'img' },
          $transform: [{ $media: {} }],
        },
        title: {
          $source: { $css: ':scope > div > div:nth-child(2)' },
          $transform: [{ $text: true }],
        },
      },
    },
  },
} satisfies PageSpec
