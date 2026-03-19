import type { Resource } from '~/protocol/scrapeer'

export const instagram: Resource = {
  $id: 'profile_page',
  $hash: 'instagram',
  $hostname: 'www.instagram.com',
  $variables: {
    profile: {
      $kind: 'url',
      $description: 'Instagram handle',
    },
  },
  $meta: {
    locale: {
      $selector: 'html',
      $extractor: {
        $extractor: 'attribute',
        $attribute: 'lang',
        $transformers: [{ $transformer: 'fallback', $value: 'en' }],
      },
    },
  },
  $waitFor: ['header + div + div a:has(img)'],
  $urlPattern: '/:profile/',
  $fields: {
    postCount: {
      $selector:
        'section:has(canvas, img) + section div:last-child:nth-child(3) :nth-child(1) .html-span',
      $ifMissing: { $strategy: 'omit' },
      $extractor: {
        $extractor: 'text',
        $transformers: [
          { $transformer: 'expand-suffix' },
          { $transformer: 'cast', $cast: 'number' },
        ],
      },
    },
    followerCount: {
      $selector:
        'section:has(canvas, img) + section div:last-child:nth-child(3) :nth-child(2) .html-span',
      $ifMissing: { $strategy: 'omit' },
      $extractor: {
        $extractor: 'text',
        $transformers: [
          { $transformer: 'expand-suffix' },
          { $transformer: 'cast', $cast: 'number' },
        ],
      },
    },
    followingCount: {
      $selector:
        'section:has(canvas, img) + section div:last-child:nth-child(3) :nth-child(3) .html-span',
      $ifMissing: { $strategy: 'omit' },
      $extractor: {
        $extractor: 'text',
        $transformers: [
          { $transformer: 'expand-suffix' },
          { $transformer: 'cast', $cast: 'number' },
        ],
      },
    },
    name: {
      $selector: 'section:has(canvas, img) + section div > span',
      $extractor: {
        $extractor: 'text',
      },
    },
    isVerified: {
      $selector: 'section:has(canvas, img) + section [aria-label=Verified]',
      $extractor: {
        $extractor: 'exists',
      },
    },
    profilePicture: {
      $selector: 'header img[alt*="profile picture"]',
      $ifMissing: { $strategy: 'omit' },
      $extractor: {
        $extractor: 'media',
      },
    },
    posts: {
      $selectorEach: 'header + div + div > div > div a:has(img)',
      // $ifMissing: { $strategy: 'bail',
      //   $warning: 'Could not find posts array' },
      $id: 'url',
      $fields: {
        image: {
          $selector: 'img',
          $ifMissing: {
            $strategy: 'bail',
            $warning: 'image not found in post?',
          },
          $extractor: {
            $extractor: 'media',
          },
        },
        alt: {
          $selector: 'img',
          $ifMissing: {
            $strategy: 'bail',
            $warning: 'image not found in post?',
          },
          $extractor: { $extractor: 'attribute', $attribute: 'alt' },
        },
      },
    },
  },
}

export const instagramPost: Resource = {
  $id: 'post',
  $hash: 'instagram-post',
  $hostname: 'www.instagram.com',
  $variables: {
    // username: {
    //   $kind: 'url',
    //   $ifMissing: {
    //     $strategy: 'omit',
    //   },
    //   $description: 'Post id',
    // },
    post_id: {
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
      $selector: 'html',
      $extractor: {
        $extractor: 'attribute',
        $attribute: 'lang',
        $transformers: [{ $transformer: 'fallback', $value: 'en' }],
      },
    },
  },
  $urlPattern: [
    '/p/:post_id',
    '/reel/:post_id',
    '/:username/p/:post_id',
    '/:username/reel/:post_id',
  ],
  $waitFor: ['[aria-label=Comment]'],
  $fields: {
    media: {
      $variants: [
        {
          $selector: '[role=presentation] ul:has(li[tabindex])',
          $fields: {
            type: { $literal: 'carousel' },
            images: {
              $selectorEach: 'li[tabindex] img',
              $extractor: {
                $extractor: 'media',
              },
            },
          },
        },
        {
          $selector: '[role=button] video[playsinline]',
          $fields: {
            type: { $literal: 'video' },
            video: {
              $extractor: { $extractor: 'media' },
            },
          },
        },
      ],
    },
    likeCount: {
      $ifMissing: {
        $strategy: 'omit',
      },
      $selector:
        'span:has([aria-label=Like], [aria-label=Unlike]) + [role=button]',
      $extractor: {
        $extractor: 'text',
        $transformers: [
          { $transformer: 'expand-suffix' },
          {
            $transformer: 'cast',
            $cast: 'number',
          },
        ],
      },
    },
    commentCount: {
      $ifMissing: {
        $strategy: 'omit',
      },
      $selector: 'span:has([aria-label=Comment]) + [role=button]',
      $extractor: {
        $extractor: 'text',
        $transformers: [
          { $transformer: 'expand-suffix' },
          {
            $transformer: 'cast',
            $cast: 'number',
          },
        ],
      },
    },
  },
}
