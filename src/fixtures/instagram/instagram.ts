import type { Resource } from '~/protocol/scrapeer'

export const instagram: Resource = {
  id: 'profile_page',
  hash: 'instagram',
  hostname: 'www.instagram.com',
  variables: [
    {
      identifier: 'profile',
      kind: 'url',
      description: 'Instagram handle',
    },
  ],
  meta: [
    {
      kind: 'selector:node',
      selector: 'html',
      extractors: [
        {
          key: 'locale',
          kind: 'extractor:attribute',
          attribute: 'lang',
          transformers: [{ kind: 'transformer:fallback', value: 'en' }],
        },
      ],
    },
  ],
  wait_for: ['header + div + div a:has(img)'],
  url_pattern: '/:profile/',
  descriptors: [
    {
      kind: 'selector:node',
      selector: 'header ul li:nth-child(1)',
      if_missing: {
        kind: 'recovery:omit',
      },
      extractors: [
        {
          kind: 'extractor:text',
          key: 'postCount',
          transformers: [
            { kind: 'transformer:regex', regex: String.raw`(\d+)` },
            { kind: 'transformer:cast', type: 'number' },
          ],
        },
      ],
    },
    {
      kind: 'selector:node',
      selector: 'header ul li:nth-child(2) span[title]',
      if_missing: {
        kind: 'recovery:omit',
      },
      extractors: [
        {
          kind: 'extractor:attribute',
          attribute: 'title',
          key: 'followerCount',
          transformers: [{ kind: 'transformer:cast', type: 'number' }],
        },
      ],
    },
    {
      kind: 'selector:node',
      selector: 'header ul li:nth-child(3)',
      if_missing: {
        kind: 'recovery:omit',
      },
      extractors: [
        {
          kind: 'extractor:text',
          key: 'followingCount',
          transformers: [
            { kind: 'transformer:regex', regex: String.raw`(\d+)` },
            { kind: 'transformer:cast', type: 'number' },
          ],
        },
      ],
    },
    {
      kind: 'selector:node',
      selector: 'header img[alt*="profile picture"]',
      if_missing: {
        kind: 'recovery:omit',
      },
      extractors: [
        {
          kind: 'extractor:attribute',
          attribute: 'src',
          key: 'profilePicture',
          transformers: [{ kind: 'transformer:cast', type: 'url' }],
        },
      ],
    },
    {
      kind: 'selector:array',
      selector: 'header + div + div a:has(img)',
      if_missing: {
        kind: 'recovery:bail',
        warning: 'Could not find posts array',
      },
      key: 'posts',
      fields: [
        {
          kind: 'selector:node',
          selector: 'svg title',
          if_missing: {
            kind: 'recovery:omit',
          },
          extractors: [
            {
              kind: 'extractor:text',
              key: 'kind',
              transformers: [],
            },
          ],
        },
        {
          kind: 'selector:node',
          selector: 'img',
          if_missing: {
            kind: 'recovery:bail',
            warning: 'image not found in post?',
          },
          extractors: [
            {
              kind: 'extractor:attribute',
              attribute: 'src',
              key: 'image_url',
              transformers: [],
            },
            {
              kind: 'extractor:attribute',
              attribute: 'alt',
              key: 'alt',
              transformers: [],
            },
          ],
        },
        {
          kind: 'selector:self',
          extractors: [
            {
              kind: 'extractor:attribute',
              key: 'post_link',
              attribute: 'href',
              transformers: [{ kind: 'transformer:cast', type: 'url' }],
            },
          ],
        },
      ],
    },
  ],
}

export const instagramPost: Resource = {
  id: 'post',
  hash: 'instagram-post',
  hostname: 'www.instagram.com',
  variables: [
    {
      identifier: 'profile',
      kind: 'url',
      description: 'Instagram handle',
    },
  ],
  meta: [
    {
      kind: 'selector:node',
      selector: 'html',
      extractors: [
        {
          key: 'locale',
          kind: 'extractor:attribute',
          attribute: 'lang',
          transformers: [{ kind: 'transformer:fallback', value: 'en' }],
        },
      ],
    },
  ],
  url_pattern: '/:profile/',
  wait_for: ['[aria-label=Comment]'],
}
