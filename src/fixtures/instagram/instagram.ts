import type { Resource } from '~/protocol/spatula'

export const instagram: Resource = {
  id: 'profile_page',
  type: 'instagram',
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
  wait_for: ['[role="menu"] + div + div a img'],
  url_pattern: '/:profile/',
  descriptors: [
    {
      kind: 'selector:node',
      selector: 'header ul li:nth-child(1)',
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
      selector: '[role="menu"] + div + div a',
      key: 'posts',
      fields: [
        {
          kind: 'selector:self',
          extractors: [
            {
              kind: 'extractor:attribute',
              key: 'url',
              attribute: 'href',
              transformers: [{ kind: 'transformer:cast', type: 'url' }],
            },
          ],
        },
        {
          kind: 'selector:node',
          selector: 'img',
          extractors: [
            {
              kind: 'extractor:attribute',
              key: 'image',
              attribute: 'src',
              transformers: [{ kind: 'transformer:cast', type: 'url' }],
            },
            {
              kind: 'extractor:attribute',
              attribute: 'alt',
              key: 'alt',
              transformers: [],
            },
          ],
        },
      ],
    },
  ],
}
