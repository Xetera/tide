import type { PageSpec } from '~/site-spec/types'

export default {
  $entity: 'sahibinden:city_listing',
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
  $meta: {
    locale: {
      $source: { $css: 'html' },
      $transform: [{ $attr: 'lang' }],
    },
  },
  $urlPattern: '/:category(/:region)?',
  $fields: {
    headers: {
      $sourceEach: { $cssEach: '#searchResultsTable thead td' },
      $fields: {
        name: {
          $transform: [
            { $text: true },
            { $trim: ['outside', 'inside'] },
          ],
        },
        class: {
          $transform: [
            { $attr: 'class' },
            { $fallback: '' },
          ],
        },
      },
    },
    latitude: {
      $source: { $css: '#gmap' },
      $transform: [
        { $attr: 'data-lat' },
        { $cast: 'number', $options: { $forceLocale: 'en' } },
      ],
    },
    longitude: {
      $source: { $css: '#gmap' },
      $transform: [
        { $attr: 'data-lon' },
        { $cast: 'number', $options: { $forceLocale: 'en' } },
      ],
    },
    rows: {
      $sourceEach: {
        $cssEach: '.searchResultsItem:not(.nativeAd):not(.searchResultsPromoSuper)',
      },
      $fields: {
        id: {
          $transform: [{ $attr: 'data-id' }],
        },
        'agency.name': {
          $source: { $css: 'a.titleIcon' },
          $ifMissing: { $strategy: 'omit' },
          $transform: [{ $attr: 'title' }],
        },
        'agency.link': {
          $source: { $css: 'a.titleIcon' },
          $ifMissing: { $strategy: 'omit' },
          $transform: [
            { $attr: 'href' },
            { $cast: 'url' },
          ],
        },
        car_brands: {
          $sourceEach: { $cssEach: '.car-brands-wrapper span' },
          $fields: {
            brand: {
              $transform: [
                { $attr: 'class' },
                { $trim: ['outside'] },
              ],
            },
          },
        },
        cells: {
          $sourceEach: { $cssEach: 'td' },
          $fields: {
            content: {
              $transform: [
                { $text: true },
                { $trim: ['outside', 'inside'] },
              ],
            },
          },
        },
        price: {
          $source: { $css: '.searchResultsPriceValue' },
          $ifMissing: { $strategy: 'omit' },
          $transform: [
            { $text: true },
            { $regex: '(.+) TL', $group: 1 },
            { $cast: 'number' },
          ],
        },
      },
    },
  },
} satisfies PageSpec
