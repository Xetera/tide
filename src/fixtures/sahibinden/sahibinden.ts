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
  $id: 'sahibinden:city_listing',
  $hostname: 'www.sahibinden.com',
  $variables: {
    region: {
      $alias: 'region',
      $kind: 'url',
      $description: 'The region of the category',
    },
    category: {
      $alias: 'category',
      $kind: 'url',
      $description: 'Category',
    },
    pagingOffset: {
      $alias: 'pageOffset',
      $kind: 'query',
      $description: 'The offset to start the search from',
      $ifMissing: { $strategy: 'fallback', $value: { $literal: '0' } },
    },
  },
  // pagination: {
  //   kind: 'offset',
  //   offsetVariable: 'pageOffset',
  // },
  $meta: {
    locale: {
      $selector: 'html',
      $extractor: {
        $extractor: 'attribute',
        $attribute: 'lang',
      },
    },
  },
  $urlPattern: '/:category(/:region)?',
  $hash: '',
  $fields: {
    headers: {
      $selectorEach: '#searchResultsTable thead td',
      $fields: {
        name: {
          $extractor: {
            $extractor: 'text',
            $transformers: [{ $transformer: 'trim', $options: ['outside', 'inside'] }],
          },
        },
        class: {
          $extractor: {
            $extractor: 'attribute',
            $attribute: 'class',
            $transformers: [{ $transformer: 'fallback', $value: '' }],
          },
        },
      },
    },
    latitude: {
      $selector: '#gmap',
      $extractor: {
        $extractor: 'attribute',
        $attribute: 'data-lat',
        $transformers: [
          { $transformer: 'cast', $cast: 'number', $options: { $forceLocale: 'en' } },
        ],
      },
    },
    longitude: {
      $selector: '#gmap',
      $extractor: {
        $extractor: 'attribute',
        $attribute: 'data-lon',
        $transformers: [
          { $transformer: 'cast', $cast: 'number', $options: { $forceLocale: 'en' } },
        ],
      },
    },
    rows: {
      $selectorEach: '.searchResultsItem:not(.nativeAd):not(.searchResultsPromoSuper)',
      $fields: {
        id: {
          $extractor: {
            $extractor: 'attribute',
            $attribute: 'data-id',
          },
        },
        'agency.name': {
          $selector: 'a.titleIcon',
          $ifMissing: { $strategy: 'omit' },
          $extractor: {
            $extractor: 'attribute',
            $attribute: 'title',
          },
        },
        'agency.link': {
          $selector: 'a.titleIcon',
          $ifMissing: { $strategy: 'omit' },
          $extractor: {
            $extractor: 'attribute',
            $attribute: 'href',
            $transformers: [{ $transformer: 'cast', $cast: 'url' }],
          },
        },
        car_brands: {
          $selectorEach: '.car-brands-wrapper span',
          $fields: {
            brand: {
              $extractor: {
                $extractor: 'attribute',
                $attribute: 'class',
                $transformers: [{ $transformer: 'trim', $options: ['outside'] }],
              },
            },
          },
        },
        cells: {
          $selectorEach: 'td',
          $fields: {
            content: {
              $extractor: {
                $extractor: 'text',
                $transformers: [{ $transformer: 'trim', $options: ['outside', 'inside'] }],
              },
            },
          },
        },
        price: {
          $selector: '.searchResultsPriceValue',
          $ifMissing: { $strategy: 'omit' },
          $extractor: {
            $extractor: 'text',
            $transformers: [
              { $transformer: 'regex', $regex: '(.+) TL', $group: 1 },
              { $transformer: 'cast', $cast: 'number' },
            ],
          },
        },
      },
    },
  },
}
