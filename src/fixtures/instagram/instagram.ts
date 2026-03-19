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
    description: {
      $selector: 'section:has(canvas, img) + section > :nth-child(2) span',
      $extractor: {
        $extractor: 'text',
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
      $selector: 'html',
      $extractor: {
        $extractor: 'attribute',
        $attribute: 'lang',
        $transformers: [{ $transformer: 'fallback', $value: 'en' }],
      },
    },
  },
  $urlPattern: [
    '/p/:postId',
    '/reel/:postId',
    '/:username/p/:postId',
    '/:username/reel/:postId',
  ],
  $waitFor: ['ul > div[role=button]'],
  $fields: {
    post: {
      $selector: '[role=presentation]',
      $fields: {
        location: {
          $selector: 'a[href^="/explore/locations"]',
          $ifMissing: {
            $strategy: 'omit',
          },
          $fields: {
            name: {
              $extractor: {
                $extractor: 'text',
              },
            },
            link: {
              $extractor: {
                $extractor: 'attribute',
                $attribute: 'href',
              },
            },
          },
        },
        user: {
          $selector: '',
        },
      },
    },
    media: [
      {
        $selector:
          ':is([role=button] video[playsinline], video[src^=blob]:has(+ [data-instancekey]))',
        $fields: {
          type: { $literal: 'video' },
          video: {
            $extractor: { $extractor: 'media' },
          },
        },
      },
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
        $selector: '[role=button][tabindex="-1"] img',
        $fields: {
          type: { $literal: 'image' },
          image: {
            $extractor: {
              $extractor: 'media',
            },
          },
        },
      },
    ],
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
    comments: {
      // $ifMissing: {
      //   $strategy: 'omit',
      // },
      $fields: {
        list: {
          $selectorEach: 'ul > div:nth-child(3) :has(ul > div)',
          $fields: {
            username: {
              $selector: 'h3',
              $extractor: {
                $extractor: 'text',
              },
            },
            comment: {
              $selector: 'h3 + div',
              $extractor: {
                $extractor: 'text',
              },
            },
            postedAt: {
              $selector: 'time',
              $extractor: {
                $extractor: 'attribute',
                $attribute: 'datetime',
                $transformers: [
                  {
                    $transformer: 'cast',
                    $cast: 'date',
                  },
                ],
              },
            },
          },
        },
        count: [
          {
            $selector: 'span:has([aria-label=Comment]) + [role=button]',
            $fields: {
              tag: { $literal: 'count_enabled' },
              value: {
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
}
