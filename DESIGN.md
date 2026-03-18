# Declarative Data Extraction Design Doc

Spatula is concerned with packaging data from a browser into a standard format that can be uploaded to any compatible server using a multipart/form-data request.

All data collection and transformation should be declarative to make sure users never have to run arbitrary code on their computers to scrape pages

```js
{
  $id: "simpsons-page",
  $hostname: "thesimpsons.com",
  $meta: {
    locale: {
      $selector: "html",
      $extractor: {
        $extractor: "attribute",
        $attribute: "lang"
      }
    }
  },
  $urlPattern: '/:directory',
  $variables: {
    directory: {
      $kind: "url",
      $description: "Directory from the url"
    },
    page: {
      $kind: "query",
      $description: "Page number",
      $ifMissing: {
        $strategy: "fallback",
        $value: { $literal: "character" }
      }
    }
  },
  lastUpdated: {
    $selector: "> span",
    $extractor: {
      $extractor: "text",
      $transformers: [
        {
          $transformer: "regex",
          $regex: "Last updated (.+)",
          $group: 1
        },
        {
          $transformer: "cast",
          $cast: "date",
        }
      ]
    }
  },
  characters: {
    $selectorEach: "#users li",
    $id: "name",
    $variants: [
      {
        tag: { $literal: "character" },
        $match: { $css: "a[href!=#]" },
        name: {
          $selector: "p",
          $extractor: { $extractor: "text" }
        },
        characterType: {
          $selector: "span",
          $ifMissing: {
            $strategy: "fallback",
            $value: { $literal: "Unknown" }
          },
          $extractor: { $extractor: "text" }
        },
        link: {
          $selector: "a",
          $extractor: {
            $extractor: "attribute",
            $attribute: "href",
            $transformers: [{ $transformer: "url" }]
          }
        },
        favorites: {
          $selectorEach: ".favorites li",
          item: {
            $extractor: {
              $extractor: "text",
              $transformers: [
                { $transformer: "lowercase" }
              ]
            }
          }
        },
        image: {
          $selector: "img",
          $ifMissing: {
            $strategy: "omit"
          },
          $extractor: { $extractor: "media" }
        }
      },
      {
        tag: { $literal: "deletedCharacter" },
      },
    ]
  },
}
```

```html
<html lang="en">
  <span>Last updated 2020-01-10</span>
  <ul id="users">
    <li>
      <p>Homer</p>
      <a href="/characters/homer-simpson">Read more</a>
      <ol class="favorites">
        <li>Bowling ball</li>
        <li>Donuts</li>
        <li>Marge</li>
      </ol>
    </li>
    <li>
      <p>Bart</p>
      <a href="/characters/batholomew-simpson">Read more</a>
      <img src="bart.jpeg" />
    </li>
    <li>
      <p>Deleted Character</p>
      <a href="#">Not available</a>
    </li>
    <li>
      <p>Principal Skinner</p>
      <span>Supporting Character</span>
      <a href="/characters/armin-tamzarian">Read more</a>
    </li>
  </ul>
</html>
```

```js
POST /ingestion HTTP/1.1
Authorization: Bearer some_token_here
Content-Type: multipart/form-data; boundary=boundary123
Content-Length: 123

--boundary123
Content-Disposition: form-data; name="1aqlqv4"; filename="bart.jpeg"
Content-Type: image/jpeg

<< buffer >>

--boundary123
Content-Disposition: form-data; name="payload"
Content-Type: application/json

{
  variables: {
    page: "characters"
  },
  payload: {
    lastUpdated: "2020-01-10",
    characters: [
      {
        tag: 'character',
        name: 'Homer',
        character_type: "Unknown",
        link: "https://thesimpsons.com/characters/homer-simpson"
        favorites: [
          {
            item: "bowling ball",
          },
          {
            item: "donuts"
          },
          {
            item: "marge"
          }
        ]
      },
      {
        tag: 'character',
        name: 'Bart',
        character_type: "Unknown",
        link: "https://thesimpsons.com/characters/batholomew-simpson",
        image: {
          url: "https://thesimpsons.com/characters/bart.jpeg",
          hash: "1aqlqv4",
          sha256checksum: "deadbeefdeadbeef"
        }
      },
      {
        tag: "deleted_character"
      },
      {
        tag: 'character',
        name: 'Principal Skinner',
        character_type: "Supporting Character",
        link: "https://thesimpsons.com/characters/armin-tamzarian"
      },
    ]
  },
}
```
