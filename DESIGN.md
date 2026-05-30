# Declarative Data Extraction Design Doc

Tide is a browser extension that packages data from a user's browser into a standard format and uploads it to a compatible server (Shoal). All data collection and transformation is declarative so users never have to run arbitrary code on their machine to scrape pages.

The protocol Tide speaks is defined in [`/Users/xetera/projects/shoal/docs/POOL_PROTOCOL.md`](../shoal/docs/POOL_PROTOCOL.md) and [`/Users/xetera/projects/shoal/docs/MEDIA_PROTOCOL.md`](../shoal/docs/MEDIA_PROTOCOL.md). This document describes the in-extension model that produces the payloads those protocols carry.

## Core concepts

### Sites and entities

A `SiteDefinition` describes a single website Tide knows how to extract data from. It has a stable `id`, a `hostname`, and a list of `Entity` declarations expressed via [TypeBox](https://github.com/sinclairzx81/typebox) (a JSON Schema builder). Each entity declares the shape of the data Tide can produce for that resource and is registered under a global, namespaced name like `@instagram/post`.

Site definitions live in `src/sites/<sitename>/` and are auto-discovered by the glob in `src/sites/index.ts`. A typical site folder contains:

- `index.ts` — calls `defineSite(...)` and re-exports the result as the default export.
- `entities.ts` — builds the entity list using `EntityBuilder`.
- `funnels/` — extraction expressions, one file per funnel (see below).

A minimal example, drawn from `src/sites/instagram/`:

```ts
// src/sites/instagram/index.ts
import { defineSite } from '~/funnels/site-builder'
import { instagramEntities } from './entities'

export const instagramSite = defineSite({
  id: 'instagram',
  hostname: 'www.instagram.com',
  entities: instagramEntities,
})

export default instagramSite
```

```ts
// src/sites/instagram/entities.ts
import { Type } from 'typebox'
import { EntityBuilder, Many, One } from '~/funnels/site-builder'
import { Image, Video } from '~/funnels/media-types'
import {
  instagram_image_identity,
  instagram_video_identity,
} from '~gleam/media/identity.mjs'

const InstagramImage = Image.offload()
  .ephemeral()
  .identity({ fn: instagram_image_identity })

const InstagramVideo = Video.offload()
  .ephemeral()
  .identity({ fn: instagram_video_identity })

export const instagramEntities = [
  new EntityBuilder('@instagram/user')
    .canonicalUrl('https://instagram.com/{username}')
    .fields({
      username: Type.String(),
      nickname: Type.String(),
      profilePic: InstagramImage,
      followerCount: Type.Integer(),
      followingCount: Type.Integer(),
      postCount: Type.Integer(),
      isPrivate: Type.Boolean(),
      isVerified: Type.Boolean(),
      bio: Type.String(),
      posts: Many('@instagram/post'),
      bioLinks: Type.Array(
        Type.Object({
          title: Type.String(),
          linkType: Type.String(),
          url: Type.String({ format: 'url' }),
        }),
      ),
    })
    .display('username')
    .version(0),

  new EntityBuilder('@instagram/post')
    .canonicalUrl('https://instagram.com/p/{code}')
    .fields({
      code: Type.String(),
      title: Type.String(),
      media: Type.Union([
        Type.Object({ kind: Type.Literal('video'), video: InstagramVideo }),
        Type.Object({
          kind: Type.Literal('carousel'),
          images: Type.Array(InstagramImage.sized()),
        }),
        Type.Object({
          kind: Type.Literal('image'),
          image: InstagramImage.sized(),
        }),
      ]),
      commentsDisabled: Type.Boolean(),
      likeCount: Type.Integer(),
      author: One('@instagram/user'),
    })
    .unique(['code'])
    .display('title'),
]
```

`EntityBuilder` produces an `Entity` value with these properties:

- `entity` — the namespaced name (`@instagram/post`).
- `version` — integer schema version, defaulting to `0`.
- `fields` — a TypeBox `TObject`. Every user-declared field is implicitly wrapped in `Type.Optional(Type.Union([T, Type.Null()]))` because patches are merged from multiple sources and any individual context may omit any individual field. The required system fields (`_entity`, `_id`, and optionally `_createdAt`) are added automatically.
- `canonicalUrl` — a template like `https://instagram.com/{username}` for rendering a stable link back to the source. Tokens are substituted with values from the patch via `resolveCanonicalUrl`.
- `uniqueFields` — fields the server can use as an alternative identity when joining records.
- `displayField` — the field to use as a human-readable label for the entity.

### Entity ids

`_id` is required on every patch and may be either a `string` or `string[]` (compound key). All other declared fields are nullable. The id space is per-entity, scoped within a pool on the server side.

### Relationships

References between entities use `One(name)` and `Many(name)`, which compile to TypeBox `$ref` schemas pointing at a shared `EntityRef` definition. At extraction time, refs are produced by the `$ref()` JSONata binding (or `ref` htmlegy pipe op) and look like:

```json
{ "_type": "ref", "_id": "6767676767" }
```

`Many` takes an array of these. Refs do not embed the referent — they only carry the foreign id and are resolved by the server when assembling the entity graph.

### Custom field types

Beyond plain JSON scalars, fields can declare typed values via the `_type` discriminator:

- `image` — `Image` from `~/funnels/media-types`, with builder modifiers `offload()`, `ephemeral(ttl?)`, `sized()`, `identity({ fn })`, `hash(...)`.
- `video` — `Video`, same modifiers.
- `money` — `Money`, an `{ amount: integer, currency: ISO-4217 }` object.
- `rich_text` — `RichText` from `~/funnels/site-builder`, a structured-content wrapper.
- `ref` — references to other entities, produced by `One`/`Many` (see above).
- `_createdAt` — well-known optional ISO-8601 timestamp recognized on every entity. Use the `$timestamp()` jsonata binding or `date(...)` htmlegy pipe op to produce one.

`offload()`, `ephemeral()`, `sized()`, and `identity()` are advisory flags carried through to the server. See `MEDIA_PROTOCOL.md` for what each one means at upload/fetch time.

Media identity functions are written in Gleam under `gleam/src/media/` and compiled to JS via `gleam build --target javascript`. They produce a stable per-platform string id for a media record from its URL or response headers, enabling the server to deduplicate the same image across different CDN URLs. Site definitions reference them with `import { foo_image_identity } from '~gleam/media/identity.mjs'`.

## Funnels

A **funnel** is a single declarative extraction expression that consumes one input (HTML page, network response, etc.) and produces an array of entity patches. Each funnel lives as a single file under `src/sites/<sitename>/funnels/` and is auto-discovered by `funnel-loader` via Vite glob imports. Funnels are stored flat — one file per funnel, with the file extension picking the format:

- `*.htmlegy` — page funnel. Operates on the rendered DOM.
- `*.jsonata` — network funnel. Operates on a captured request/response.
- `*.json` — fixtures, used by tests and by the in-extension playground.

Every funnel starts with YAML frontmatter declaring how to match it:

```
---
name: "Listing Page"
url: "/ilan/*/detay"
---
```

For page funnels the frontmatter must include `url` (a string or array of strings, matched as a glob against the current pathname). For network funnels it must include `url` and `method` (`GET` | `POST` | ...). Missing or malformed frontmatter causes the entry to be skipped with a console warning.

Funnels sharing the same `funnel` name (the file basename without extension) are grouped under a `NetworkFunnelGroup`, which lets a single logical funnel cover multiple sibling jsonata files matching the same request shape.

### Page funnels (htmlegy)

`htmlegy` is the in-house DSL for HTML extraction. It is not a public package — the grammar lives at `tree-sitter-htmlegy/grammar.js` and the runtime at `packages/htmlegy/` (parser, compiler, locale-aware date/number/currency parsers). DOM integration (selecting, text extraction, attribute reads) lives in `packages/htmlegy-dom/`. The Zed editor integration is in `zed-htmlegy/`.

The language compiles to a `HtmlegyExpr` that evaluates against a `Document` and produces JSON-compatible output. Core surface:

- `$(<css>)` selects a single matching node; `$$(<css>)` selects each match (produces an array). Both can be prefixed with `await` (wait for selectors to appear) or `await watch ... +` (subscribe to a DOM subtree and re-emit as it mutates).
- `$ | text`, `$ | innerText`, `$ | data(name)`, `$ | attr(name)`, `$ | lines`, `$ | merge`, `$ | trim` etc. are chainable pipe ops.
- Format helpers: `money()`, `date(locale: '...', format: '...')`, `number(locale: '...')`, `expandSuffix`, `regex(pattern, group)`, `url`, `media`, `rich_text`, `image`, `ref`.
- `match { ... }` and `match { selector => ... }` for branching on which selector hits.
- `?` after a selector or pipe step makes it optional; the surrounding field is omitted if it is missing rather than producing an error.

Sample (`src/sites/sahibinden/funnels/listing.htmlegy`):

```
---
name: "Listing Page"
url: "/ilan/*/detay"
---
[
  {
    "_entity": "@sahibinden/listing",
    "_id": $(.classifiedId) | data(classifiedid) ?? $(#classifiedId) | text,
    "name": $(.classifiedDetailTitle h1) | text | trim,
    "price": $(.classified-price-wrapper) | text | money(),
    "description": $(#classifiedDescription) | rich_text,
    "attributes": $$(.classifiedInfoList li, .classified-info-list li) {
      [$(strong) | text | trim]: $(span) | text | trim
    } | merge,
    ($(#gmap) {
      "latitude": $ | data(lat) | number(locale: 'en'),
      "longitude": $ | data(lon) | number(locale: 'en')
    }),
    "images": match {
      $$([data-extra-class="mega-image"] ul > li) => {
        "_type": "image",
        "url": $(source[type="image/png"]) | attr(srcset) | url
      }
      $$(.megaPhotoThmbItem) => {
        "_type": "image",
        "url": $(img) | data(source) | url
      }
    }
  },
  $(.classifiedUserBox:has(.storeInfo)) {
    "_entity": "@sahibinden/agency",
    "_id": $(.storeBox a) | attr(href) | url,
    "name": $(.storeInfo) | text | trim,
    "link": $(.storeBox a) | attr(href) | url,
    "logo": $(img) | media
  }
]
```

The compiler reports `SelectorError` with the failing selector, the field it was scoped to, and a snippet of the surrounding context whenever a required selector matches nothing. Optional selectors (`?`) suppress this and omit the field.

### Network funnels (jsonata)

Network funnels run against captured HTTP responses. They use [JSONata](https://jsonata.org/) for the transformation, with two bound variables and a handful of helpers:

- `$request` — `{ url, method, headers }`
- `$response` — `{ url, status, headers, body }` (the funnel expression is evaluated against `$response.body` as its default context)
- `$image(url)` → `{ _type: 'image', url }`
- `$video(url)` → `{ _type: 'video', url }`
- `$with_dimensions(media, width, height)` — merges `width` and `height` into a media object.
- `$unique_id(obj, id)` — attaches a stable `_id` to a media object.
- `$ref(id)` — produces an `EntityRef` (handles arrays).
- `$timestamp(value)` — coerces an ISO string, unix timestamp, or JS Date-parseable string to ISO-8601.
- `$query_param(url, param)` — extracts a query parameter from a URL.

Sample (`src/sites/instagram/funnels/mediaInfo.jsonata`):

```
---
name: "Media Info"
method: GET
url: "/api/v1/media/*/info/"
---
[
  items.{
    "_entity": "@instagram/post",
    "_id": pk,
    "_createdAt": $timestamp(taken_at),
    "title": caption.text,
    "media": video_versions ? {
      "kind": "video",
      "video": $video(video_versions[0].url)
                 ~> $with_dimensions(width, height)
                 ~> $unique_id(id)
    } : carousel_media ? {
      "kind": "carousel",
      "images": carousel_media[]@$M.(
        $image($M.image_versions2.candidates[0].url)
          ~> $with_dimensions($M.width, $M.height)
          ~> $unique_id($M.pk)
      )
    } : image_versions2 ? {
      "kind": "image",
      "image": $image(image_versions2.candidates[0].url)
    },
    "commentsDisabled": comments_disabled,
    "likeCount": like_and_view_counts_disabled ? null : like_count,
    "commentCount": comment_count,
    "author": $ref(user.pk)
  }
]
```

### Fixtures

A funnel `foo` may have one or more JSON fixtures next to it (`foo.json`, `validRequest.json`, `notFound.json`, ...) used as inputs in tests (`foo.spec.ts`) and by the in-extension playground for live previewing. Fixtures must not contain personally identifiable data — they are committed alongside the code. The auto-discovery layer attaches fixtures to their owning funnel by basename match.

### Patches and merging

A funnel always returns an **array** of patches (`RawEntityPatch[]`). Each patch is one entity update; a single payload can produce patches for many entities at once. Patches are validated by `entity-validator` against the relevant entity's TypeBox schema before being submitted. Because patches accumulate from different contexts (a comments endpoint produces partial user data; a profile page fills in the rest), **all declared fields are implicitly nullable except `_id`**. Server-side merge logic is responsible for deciding how to combine patches.

## Capture sources

Funnels are driven by sources in `src/funnels/debug/` and the content-script capture layer:

- `network-source.ts` / content-scripts/`network-capture-main.ts` / `network-intercept.ts` — intercepts `fetch`/`XHR` from the page world, matches requests against any funnel via `SiteDefinition.matchesCapture(url, method)`, and pipes matched responses through the corresponding network funnel.
- `html-page-source.ts` and `content-scripts/tide.ts` — observes page loads and mutations, runs `PageEvaluator` against each matching `PageFunnel`, and emits scrape results.
- `content-scripts/asset-capture-main.ts` and `stream-capture.ts` — capture media bytes from the page so the extension can hash and (optionally) upload them per `MEDIA_PROTOCOL.md`.

`PageEvaluator` is the dispatcher for page funnels. It checks for known failure states (e.g. Cloudflare challenge pages) first, then collects all `PageFunnel`s whose hostname and URL pattern match the current document and returns them as a `MatchingPageFunnels` result. A `NoMatchFailure` is returned with a tagged reason otherwise.

## Active vs passive mode

Workers can opt into either passive or active scraping per pool (`ServerAutonomy.Passive` vs `Active`). In **passive** mode, Tide only observes traffic and DOM the user produces themselves — zero extra requests are issued. In **active** mode the extension polls `GET /workers/me/jobs` for assigned URLs and opens them in iframes inside an existing matching-origin tab to fulfill the job. Active mode requires editing `X-Frame-Options`/`Content-Security-Policy`/`Sec-Fetch-Dest` on the iframe response. See `README.md` for the full security and cookie discussion.

## Workspace layout

```
src/
  app/              UI (Solid) for the popup, playground, scrape viewer, etc.
  background/       MV3 service worker — capture orchestration, job queue, badge, storage.
  content-scripts/  Page-world scripts: network intercept, asset capture, mutation tracking.
  funnels/          Funnel loading, parsing, evaluation; site/entity builders; media types.
  sites/            One folder per site (entities, funnels, fixtures).
  server/           Shoal HTTP client and job queue.
  shared/           Cross-cutting helpers: storage, logging, hooks, uids.
  generated/        Generated OpenAPI types for the Shoal API (`generate-shoal-api-types.mjs`).
  generation/       Spec-generation helpers (LLM-assisted prompting for new specs).

packages/
  htmlegy/          DSL grammar bundle + compiler/parser, locale-aware date/number/currency.
  htmlegy-dom/      DOM provider — adapts htmlegy to a real `Document` or happy-dom.
  frontmatter/      YAML-frontmatter parser shared between extension and tooling.
  design-tokens/    CSS custom properties + Tailwind v4 `@theme` block, shared with Shoal.

gleam/              Gleam sources for shared logic compiled to JS (media identity, etc.).
tree-sitter-htmlegy/  Tree-sitter grammar for htmlegy (used by editor integrations).
zed-htmlegy/        Zed editor integration for htmlegy.
schemas/            JSON Schemas exported from entity definitions.
scripts/            Build helpers (OpenAPI codegen, Android push, etc.).
```

## Server contract

Tide talks to Shoal over the endpoints defined in `POOL_PROTOCOL.md`. The OpenAPI types it consumes are regenerated by `pnpm api:types` and live in `src/generated/shoal-api.ts`; the runtime client is `src/server/client.ts` and `src/server/api.ts`. Workers authenticate to a pool with an HMAC of the request body keyed by their pool-specific `worker_secret`. The full request/response shapes — join, opt-in, job polling, job submission, asset upload — are described in the protocol docs and consumed directly by `client.ts`.

Media assets submitted with payloads use the hash-plus-token model from `MEDIA_PROTOCOL.md`. Tide hashes asset bytes with SHA-256, attaches the hash to the payload, and either uploads the bytes via `POST /assets/:sha256` (paired with an HMAC token over the hash) or lets the server fetch the asset itself when its `source: server` path is viable.
