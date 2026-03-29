import type { PageSpec } from '~/protocol/scrapeer'

export const instagram: PageSpec = {
  $id: 'profile_page',
  $hash: 'instagram',
  $entity: 'instagram:profile',
  $hostname: 'www.instagram.com',
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
      // Expanded extractor <span title="123,123,123">
      $selector:
        'section:has(canvas, img) + section a[href$="/followers/"] span[title]',
      $ifMissing: { $strategy: 'omit' },
      $extractor: {
        $extractor: 'attribute',
        $attribute: 'title',
        $transformers: [
          { $transformer: 'expand-suffix' },
          { $transformer: 'cast', $cast: 'number' },
        ],
      },
    },
    followingCount: {
      $selector:
        'section:has(canvas, img) + section a[href$="/following/"] > span > span > span',
      $ifMissing: { $strategy: 'omit' },
      $extractor: {
        $extractor: 'text',
        $transformers: [
          { $transformer: 'expand-suffix' },
          { $transformer: 'cast', $cast: 'number' },
        ],
      },
    },
    nickname: {
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
      $selector:
        'section:has(canvas, img) + section > :nth-child(2) > div span',
      $ifMissing: {
        $strategy: 'fallback',
        $value: {
          $literal: '',
        },
      },
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
      $selectorEach:
        'header + div + div > div > div a:has(img:not([alt$="profile picture"]))',
      $entity: 'instagram:post',
      // $ifMissing: { $strategy: 'bail',
      //   $warning: 'Could not find posts array' },
      $id: 'url',
      $fields: {
        isPinned: {
          $selector: '[aria-label="Pinned post icon"]',
          $extractor: {
            $extractor: 'exists',
          },
        },
        kind: [
          {
            $selector: '[aria-label=Carousel]',
            $literal: 'carousel',
          },
          {
            $selector: '[aria-label=Clip]',
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
          $extractor: {
            $extractor: 'attribute',
            $attribute: 'href',
            $transformers: [
              {
                $transformer: 'cast',
                $cast: 'url',
              },
            ],
          },
        },
        preview: {
          $selector: 'img',
          $ifMissing: {
            $strategy: 'omit',
            $warning: 'image not found in post?',
          },
          $extractor: {
            $extractor: 'media',
          },
        },
        alt: {
          $selector: 'img',
          $ifMissing: {
            $strategy: 'omit',
            $warning: 'image not found in post?',
          },
          $extractor: { $extractor: 'attribute', $attribute: 'alt' },
        },
      },
    },
    stories: {
      $selectorEach: `a[href^="/stories/"]`,
      $ifMissing: {
        $strategy: 'omit',
      },
      $fields: {
        link: {
          $extractor: {
            $extractor: 'attribute',
            $attribute: 'href',
            $transformers: [
              {
                $transformer: 'cast',
                $cast: 'url',
              },
            ],
          },
        },
        coverImage: {
          $selector: 'img',
          $extractor: {
            $extractor: 'media',
          },
        },
        title: {
          $selector: ':scope > div > div:nth-child(2)',
          $extractor: {
            $extractor: 'text',
          },
        },
      },
    },
  },
}

export const instagramPost: PageSpec = {
  $id: 'post',
  $hash: 'instagram-post',
  $hostname: 'www.instagram.com',
  $entity: 'instagram:post',
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
  $waitFor: ['div + hr + div > div', 'ul > div[role=button]'],
  $fields: {
    post: {
      $fields: {
        description: {
          $selector: 'div + hr + div div > span > div > div + span',
          $extractor: {
            $extractor: 'text',
          },
        },
        user: {
          $fields: {
            avatar: {
              $selector: 'div + hr + div a[role=link] img',
              $extractor: {
                $extractor: 'media',
              },
            },
          },
        },
        location: {
          $selector: '[role=presentation] a[href^="/explore/locations"]',
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
                $transformers: [
                  {
                    $transformer: 'cast',
                    $cast: 'url',
                  },
                ],
              },
            },
          },
        },
        // postedAt: {
        //   $selector: 'a[role=link] time',
        //   $extractor: {
        //     $extractor: 'attribute',
        //     $attribute: 'datetime',
        //     $transformers: [
        //       {
        //         $transformer: 'cast',
        //         $cast: 'date',
        //       },
        //     ],
        //   },
        // },
        // user: {
        //   $selector: '',
        // },
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
    likeCount: [
      {
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
      {
        $selector:
          '[role=presentation] > div > section + section div[role=button] > .html-span',
        $extractor: {
          $extractor: 'text',
          $transformers: [
            {
              $transformer: 'cast',
              $cast: 'number',
            },
          ],
        },
      },
    ],
    comments: {
      // $ifMissing: {
      //   $strategy: 'omit',
      // },
      $fields: {
        list: {
          $selectorEach:
            'ul > div > div > div > div:has(> ul > div[role=button])',
          $fields: {
            username: {
              $selector: 'h3',
              $extractor: {
                $extractor: 'text',
              },
            },
            isVerified: {
              $selector: '[aria-label="Verified"]',
              $extractor: {
                $extractor: 'exists',
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
            likes: {
              $selector: 'a:has(time) + button',
              $extractor: {
                $extractor: 'text',
                $transformers: [
                  {
                    $transformer: 'regex',
                    $regex: '[0-9,.]+',
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
