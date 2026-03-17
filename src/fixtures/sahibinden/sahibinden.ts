import type { JobParameters, Resource } from '~/protocol/scrapeer'

export const sahibindenSmallJobs: JobParameters[] = [
  {
    id: '1',
    expires_at: new Date(),
    issued_at: new Date(),
    resource_id: 'sahibinden:city_listing',
    url: 'https://www.sahibinden.com/satilik/istanbul',
  },
]

export const sahibinden: Resource = {
  id: 'sahibinden:city_listing',
  hostname: 'www.sahibinden.com',
  variables: [
    {
      alias: 'region',
      identifier: 'region',
      kind: 'url',
      description: 'The region of the category',
    },
    {
      alias: 'category',
      identifier: 'category',
      kind: 'url',
      description: 'Category',
    },
    {
      alias: 'pageOffset',
      identifier: 'pagingOffset',
      kind: 'query',
      description: 'The offset to start the search from',
      default: '0',
    },
  ],
  // pagination: {
  //   kind: 'offset',
  //   offsetVariable: 'pageOffset',
  // },
  meta: [
    {
      kind: 'selector:node',
      selector: 'html',
      extractors: [
        {
          key: 'locale',
          kind: 'extractor:attribute',
          attribute: 'lang',
          transformers: [],
        },
      ],
    },
  ],
  url_pattern: '/:category(/:region)?',
  descriptors: [
    {
      key: 'headers',
      kind: 'selector:array',
      selector: '#searchResultsTable thead td',
      fields: [
        {
          kind: 'selector:self',
          extractors: [
            {
              kind: 'extractor:text',
              key: 'name',
              transformers: [
                {
                  kind: 'transformer:trim',
                  options: ['outside', 'inside'],
                },
              ],
            },
            {
              kind: 'extractor:attribute',
              key: 'class',
              attribute: 'class',
              transformers: [
                {
                  kind: 'transformer:fallback',
                  value: '',
                },
              ],
            },
          ],
        },
      ],
    },
    {
      kind: 'selector:node',
      selector: '#gmap',
      extractors: [
        {
          kind: 'extractor:attribute',
          attribute: 'data-lat',
          key: 'latitude',
          transformers: [
            {
              kind: 'transformer:cast',
              type: 'number',
              options: { force_locale: 'en' },
            },
          ],
        },
        {
          kind: 'extractor:attribute',
          attribute: 'data-lon',
          key: 'longitude',
          transformers: [
            {
              kind: 'transformer:cast',
              type: 'number',
              options: { force_locale: 'en' },
            },
          ],
        },
      ],
    },
    {
      fields: [
        {
          kind: 'selector:self',
          extractors: [
            {
              kind: 'extractor:attribute',
              key: 'id',
              attribute: 'data-id',
              transformers: [],
            },
          ],
        },
        {
          kind: 'selector:node',
          selector: 'a.titleIcon',
          if_missing: { kind: 'recovery:omit' },
          extractors: [
            {
              kind: 'extractor:attribute',
              attribute: 'title',
              key: 'agency.name',
              transformers: [],
            },
            {
              kind: 'extractor:attribute',
              attribute: 'href',
              key: 'agency.link',
              transformers: [
                {
                  kind: 'transformer:cast',
                  type: 'url',
                },
              ],
            },
          ],
        },
        {
          kind: 'selector:array',
          key: 'car_brands',
          selector: '.car-brands-wrapper span',
          if_missing: { kind: 'recovery:omit' },
          fields: [
            {
              kind: 'selector:self',
              extractors: [
                {
                  kind: 'extractor:attribute',
                  attribute: 'class',
                  key: 'brand',
                  transformers: [
                    { kind: 'transformer:trim', options: ['outside'] },
                  ],
                },
              ],
            },
          ],
        },
        {
          kind: 'selector:array',
          key: 'cells',
          selector: 'td',
          fields: [
            {
              kind: 'selector:self',
              extractors: [
                {
                  kind: 'extractor:text',
                  key: 'content',
                  transformers: [
                    {
                      kind: 'transformer:trim',
                      options: ['outside', 'inside'],
                    },
                  ],
                },
              ],
            },
          ],
        },
        {
          kind: 'selector:node',
          if_missing: { kind: 'recovery:omit' },
          selector: '.searchResultsPriceValue',
          extractors: [
            {
              key: 'price',
              kind: 'extractor:text',
              transformers: [
                {
                  kind: 'transformer:regex',
                  regex: '(.+) TL',
                  replacement: null,
                },
                {
                  type: 'number',
                  kind: 'transformer:cast',
                },
              ],
            },
          ],
        },
        // {
        //   kind: 'selector:node',
        //   selector: null,
        //   extractors: [
        //     {
        //       kind: 'extractor:attribute',
        //       key: 'id',
        //       attribute: 'data-id',
        //       transformers: [],
        //     },
        //   ],
        // },
        // {
        //   kind: 'selector:node',
        //   extractors: [
        //     {
        //       attribute: 'href',
        //       key: 'url',
        //       kind: 'extractor:attribute',
        //       transformers: [
        //         {
        //           type: 'url',
        //           kind: 'transformer:cast',
        //         },
        //       ],
        //     },
        //     {
        //       key: 'title',
        //       kind: 'extractor:text',
        //       transformers: [
        //         {
        //           kind: 'transformer:trim',
        //           options: ['outside'],
        //         },
        //       ],
        //     },
        //   ],
        //   selector: '.classifiedTitle',
        // },
        // {
        //   kind: 'selector:node',
        //   selector: '.searchResultsDateValue',
        //   extractors: [
        //     {
        //       key: 'date',
        //       kind: 'extractor:text',
        //       transformers: [
        //         {
        //           kind: 'transformer:trim',
        //           options: ['inside', 'outside'],
        //         },
        //       ],
        //     },
        //   ],
        // },
      ],
      key: 'rows',
      kind: 'selector:array',
      selector:
        '.searchResultsItem:not(.nativeAd):not(.searchResultsPromoSuper)',
    },
  ],
  hash: '',
}
