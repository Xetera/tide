# Declarative Data Extraction Design Doc

Spatula is concerned with packaging data from a browser into a standard format that can be uploaded to any compatible server. All data collection and transformation should be declarative to make sure users never have to run arbitrary code on their computers to scrape pages.

## Core concepts

### Entities

Spatula describes a "world view" schema of a website using TypeBox (JSON schema). It describes how entities should look like:

```js
const InstagramEntities: Entity[] = [
  defineEntity('@instagram/user', {
    $fields: {
      name: Type.String(),
      followers: Type.Integer()
    }
  }),
  defineEntity('@instagram/post', {
    $fields: {
      title: Type.String(),
      media: Type.Union([
        Type.Object({
          kind: Type.Literal('video'),
          video: Media.Video.offload().ephemeral().sized()
        })
        Type.Object({
          kind: Type.Literal('carousel'),
          images: Type.Array(
            Media.Image.offload().ephemeral().sized()
          )
        }),
      ]),
      commentsDisabled: Type.Boolean(),
      likeCount: Type.Integer(),
      lat: Type.Integer(),
      lon: Type.Integer()
    },
    $relationships: {
      author: One('@instagram/user'),
      comments: Many('@instagram/comment')
    }
  })
]

import mediaInfo from './mediaInfo.jsonata?raw'

const Instagram: SiteDefinition = {
  entities: InstagramEntities,
  hostname: 'instagram.com',
  requests: {
    mediaInfo: {
      method: 'GET',
      url: '/api/v1/media/:id/info/',
    } satisfies RequestMatcher
  },
}

export default Instagram
```

Any number of these entities can be extracted from any kind of browser event such as:

- Network Request
- Page Load
- HTML Change
- Message passing / Function call

Site specs live in `src/sites/:sitename` and include `./loaders` folder with definitions on how to fetch data. For example:

`./loaders/mediaInfo/request.jsonata`

```ts
/* jsonata schema here */
```

alongside fixtures like `./loaders/mediaInfo/validRequest.json` and `./loaders/mediaInfo/notFound.json`

HTML scraping logic lives in `./loaders/*/index.ts` exporting `PageSpec` types.

Entity definitions can contain any valid json scalar:

- String
- Number
- Null
- etc...

They can also contain custom types in an object denoted by `_type` such as

- date (from unix timestamp, js timestamp, ISO string)
- media
  - image
  - video

Entity objects can also contain a reference to `_createdAt` to define when the entity was created. This is a well-known field and should be prioritized over others.

And references to other resources denoted by `{ _ref: '@site/entity', key: '...' }` a key is almost always a string but could be set to a compound value with an array of strings.

Given a JSON from an instagram http response such as this one, it can be converted using a JSONata schema using pre-defined functions.

```json
{
  "items": [
    {
      "id": "3868587352050111",
      "caption": {
        "text": "Hello gamers"
      },
      "disable_caption_and_comment": false,
      "like_count": 53,
      "carousel_media": [
        {
          "url": "https://scontent-vie1-1.cdninstagram.com/v/t51.82787-19/image.jpg",
          "width": 640,
          "height": 1136
        },
        {
          "url": "https://scontent-vie1-1.cdninstagram.com/v/t51.82787-19/image.jpg",
          "width": 640,
          "height": 1136
        }
      ],
      "author": {
        "id": "6767676767",
        "full_name": "John Doe",
        "username": "johndoe.123",
        "profile_pic": "https://scontent-vie1-1.cdninstagram.com/v/t2746247/image.jpg"
      },
      "top_likes": [
        {
          "id": "696969696",
          "full_name": "Jane Doe",
          "username": "janedoe.123"
        },
        {
          "id": "111111111111",
          "full_name": "Nice meme",
          "username": "The Legend 27"
        }
      ]
    }
  ]
}
```

We can extract data from this payload using the following jsonata query:

```jsonata
[
  items.{
    "_entity": "@instagram/post",
    "_id": id,
    "title": caption.text,
    "media": video_versions ? {
      "kind": "video",
      "video": $video(video_versions.url)
    } : carousel_media ? {
      "kind": "carousel",
      "images": carousel_media[].(
        $image(url) ~> $with_dimensions(width, height)
      )
    },
    "commentsDisabled": disable_caption_and_comment,
    "likeCount": like_count,
    "author": $ref("@instagram/user", author.id),
    "likedBy": $ref("@instagram/user", top_likes.id)
  },

  items.author.{
    "_entity": "@instagram/user",
    "_id": id,
    "username": username,
    "nickname": full_name,
    "profilePic": $image(profile_pic)
  },

  items.top_likes.{
    "_entity": "@instagram/user",
    "_id": id,
    "name": username
  }
]
```

JSONata has the follow bindings available when acting on requests

- `$request.url`
- `$request.headers`
- `$request.body`
- `$response.url`
- `$response.status`
- `$response.headers`
- `$entity($fields, $name)`
- `$video($url)` -> { \_type: "video", url: ... }
- `$image($url)` -> { \_type: "image", url: ... }
- `$with_dimensions($width, $height)`

This will produce the folowing output

```json
[
  {
    "_entity": "@instagram/post",
    "id": "3868587352050111",
    "title": "Hello gamers",
    "media": {
      "kind": "carousel",
      "images": [
        {
          "_type": "image",
          "url": "https://scontent-vie1-1.cdninstagram.com/v/t51.82787-19/image.jpg",
          "width": 640,
          "height": 1136
        },
        {
          "_type": "image",
          "url": "https://scontent-vie1-1.cdninstagram.com/v/t51.82787-19/image.jpg",
          "width": 640,
          "height": 1136
        }
      ]
    },
    "commentsDisabled": false,
    "likeCount": 53,
    "author": {
      "_ref": "@instagram/user",
      "id": "6767676767"
    },
    "likedBy": [
      {
        "_ref": "@instagram/user",
        "id": "696969696"
      },
      {
        "_ref": "@instagram/user",
        "id": "111111111111"
      }
    ]
  },
  {
    "_entity": "@instagram/user",
    "id": "6767676767",
    "username": "johndoe.123",
    "nickname": "John Doe",
    "profilePic": {
      "_type": "image",
      "url": "https://scontent-vie1-1.cdninstagram.com/v/t2746247/image.jpg"
    }
  },
  {
    "_entity": "@instagram/user",
    "id": "696969696",
    "name": "janedoe.123"
  },
  {
    "_entity": "@instagram/user",
    "id": "111111111111",
    "name": "The Legend 27"
  }
]
```

The resulting type has to contain an array of entity patches.

Because entity information is made up of patches from different contexts, every entity field produced from an event is implicitly nullable except for the entity id defined in the schema. It's up to the backend to decide what can and can't be nullable for consumers

SiteSpecs are stored under `src/sites/:sitename`. Each network request capable of producing entities has its own folder with a .jsonata file, and sanitized fixtures of inputs (no personal user information) to run against it. The results should be checked against the current schema to make sure data is compliant. Tests should be written to ensure different cases like 404 are handled properly.
