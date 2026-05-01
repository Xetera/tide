# HTMLevate

The HTML counterpart to JSONata. Unlike JSONata, HTMLevate requires a DOM to function and can realistically only run on browser environments. This is evaluated at runtime and does not necessarily compile to a PageSpec in types.ts. If it does, it's not tied to that implementation.

Instead of using `.key.key2 { ... }` We use CSS selectors to parse text `$(#anchor + div)`

## Examples

```html
<ul id="users">
  <li data-age="42">
    <p>Homer</p>
    <span class="verified">✓</span>
    <a href="/characters/homer-simpson">Read more</a>
  </li>
  <li>
    <p>Bart</p>
    <img src="bart.jpg" />
    <a href="/characters/bartholomew-simpson">Read more</a>
  </li>
  <li>
    <p>Principal Skinner</p>
    <a href="/characters/armin-tamzarian">Read more</a>
  </li>
</ul>
```

could be selected like this

```
{
  "users": $$(#users > li) {
    "nickname": $(p):text,
    "page": $(a):attr(href) | url,
    "age": $:data(age) | number,
    "img": $(img) | media,
    "isVerified": $(span.verified):exists
  }
}
```

they could also be aggregated into an object like

```
{
  "users": $$(#users > li) {
    [$(p):text]: {
      "page": $(a):attr(href) | url,
      "age": $:data(age) | number
    }
  } | merge
}
```

## Selectors

### Single element: `$(selector)`

Selects the first matching element within the current context. Corresponds to `querySelector`.

```
$(h1):text
```

### Each element: `$$(selector)`

Selects all matching elements within the current context. Corresponds to `querySelectorAll`. Must be followed by a `{ }` block or a transform pipeline that produces an array.

```
$$(ul > li) { ... }
```

### Context reference: `$`

Refers to the current element context without selecting a new node. Used as a fallback in `match` expressions and as an implicit source when no `$()` is present at the start of a pipeline.

```
$:text
```

### Root reference: `@`

Refers to the top-level root element passed to the evaluator, regardless of the current context. Useful for escaping deep iteration contexts to read page-level data.

```
$$(ul > li) {
  "title": $:text,
  "pageHeading": @.($(h1):text)
}
```

### Scoped expression: `expr.( inner )`

Evaluates `inner` with the result of `expr` as the new context element. Equivalent to JSONata's block scoping. Works on any pipeline value that resolves to an element.

```
$(div).( $(span):text )
```

Combined with `@`, this is the primary way to query from the document root inside a `$$` block:

```
$$(li) {
  "id": $:data(id),
  "siteTitle": @.($(h1):text)
}
```

### Node alias: `@name $$(selector)`

Binds the current context element to a name before descending into a child scope. Allows referencing an ancestor element from within a nested `$$` block where `$` already refers to the child.

```html
<ul>
  <li data-list-id="42">
    <a href="/posts/1">First</a>
    <a href="/posts/2">Second</a>
  </li>
</ul>
```

```
@row $$(ul > li) {
  "links": $$(a) {
    "href": $:attr(href) | url,
    "listId": @row:data(list-id)
  }
}
```

Without `@row`, there would be no way to reach back up to the `li`'s `data-list-id` from inside the `a` block since `$` is rebound to each `a` element.

### Conditionals: `?`

Allows doing conditional queries on resulting data with

```
$(p):text ? true : false
```

The second `:` is optional and conditionals can be written like

```
$(p):text ? true
```

Where the fallback is `undefined` (which means the key must be removed)

### Selector fallback: `??`

Tries each selector in order and resolves to the first one that matches. The pipeline after the last `??` applies to whichever element was found.

```
$(span:has([aria-label=Like]) + [role=button])
  ?? $([role=presentation] div[role=button] > .html-span)
  | expandSuffix | number
```

Useful when the same value appears in different locations across page variants and the transform pipeline is identical regardless of which element matched.

## Transforms

Transforms are applied in sequence after a selector, separated by `|`. Each transform receives the previous value and produces a new one.

### `:text`

Extracts the text content of the element.

```
$(h1):text
```

### `:attr(name)`

Extracts the value of an attribute.

```
$(a):attr(href)
```

### `:data(name)`

Extracts the value of a `data-*` attribute.

```
$:data(age) | number
```

### `:exists`

Returns `true` if the element exists, `false` otherwise. Used for boolean flags derived from element presence.

```html
<div class="verified-badge" aria-label="Verified"></div>
```

```
{
  "isVerified": $([aria-label=Verified]):exists
}
```

### `| media`

Extracts an image or video element as a media reference. Used on `<img>` and `<video>` elements. The result contains the URL and optional dimensions.

If htmlevate is configured to intercept data at the network level it can also expose the raw bytes mapped to the URL set to the img or video tag. For videos, this is not guaranteed to represent the full video as many videos are buffered and partially loaded.

```html
<img src="https://example.com/photo.jpg" width="640" height="480" />
```

```
{
  "photo": $(img) | media
}
```

Produces

```
{
  "photo": {
    "type": "image",
    "url": "https://example.com/photo.jpg",
    "dimensions": { "width": 640, "height": "480" },
    "duration": ...
  }
}
```

### `| number`

Casts the string value to a number. Uses the locale from `$meta.locale` when parsing formatted numbers.

```
$:data(age) | number
```

Can also optionally receive a locale argument to override the compile-time locale:

```
$:data(age) | number(locale: 'tr')
```

### `| url`

Resolves a relative URL to an absolute URL using the page's origin.

```
$(a):attr(href) | url
```

### `| expandSuffix`

Expands shorthand suffixes like `1.5K` to `1500` or `2.3M` to `2300000` before numeric casting.

```html
<span>42.1K likes</span>
```

```
{
  "likeCount": $(span):text | expandSuffix | number
}
```

### `| regex(pattern, group?)`

Extracts a substring using a regular expression. The optional second argument selects a capture group (default: full match).

```html
<span>Price: 1,234 TL</span>
```

```
{
  "price": $(span):text | regex("(.+) TL", 1) | number
}
```


### `| trim`

Trims whitespace. Accepts `outside` to strip leading/trailing whitespace, `inside` to collapse internal runs of whitespace.

```
$(td):text | trim(outside, inside)
```

By default trims everything

### `| lowercase`

Converts the string to lowercase.

```
$(span):text | lowercase
```

### `| date`

Parses the string value as a date. Commonly applied to `datetime` attributes on `<time>` elements.

```html
<time datetime="2024-06-15T12:00:00Z">June 15</time>
```

```
{
  "postedAt": $(time):attr(datetime) | date
}
```

## Arrays

A top-level `[ ]` produces an array of entities. Each item is an expression. Items that are themselves arrays (e.g. a `$$` pipeline) are flattened into the result — this is the primary way to emit multiple entity types from a single page.

```
[
  {
    "_entity": "@example/page",
    "_id": $(#id):data(value),
    "title": $(h1):text
  },
  $$(ul > li) {
    "_entity": "@example/item",
    "_id": $:data(id),
    "parentId": @.($( #id):data(value)),
    "text": $:text
  }
]
```

The first item is a single object. The second is a `$$` pipeline producing multiple objects, all flattened into the same top-level array.

## Reactivity

### `await` — condition-gated evaluation

Delays evaluation of a selector until a DOM condition is satisfied. Uses a `MutationObserver` internally and resolves once.

**Form 1 — wait for the target selector to exist:**

```
"users": await $$(#users > li) {
  "name": $(p):text
}
```

Waits until at least one `#users > li` is present in the DOM before evaluating the block.

**Form 2 — wait for a sentinel condition, then evaluate a different selector:**

```
"users": await(#spinner:not(.active)) $$(#users > li) {
  "name": $(p):text
}
```

Waits until `#spinner:not(.active)` matches (i.e. the spinner is no longer active), then evaluates the `$$` block. The condition is any valid CSS selector.

### `watch` — MutationObserver-driven re-evaluation

Re-runs a block whenever the DOM changes within the observed subtree. Evaluates immediately on first call, then re-evaluates on each `MutationObserver` fire.

```
"comments": watch $$(ul > li) {
  "text": $(p):text
}
```

Only meaningful on selectors followed by a block. The observer targets the parent element of the matched nodes (or the root if no match exists yet).

`watch` and `await` can be combined — `watch` fires after `await` resolves:

```
"comments": watch await(#loading:not(.visible)) $$(ul > li) {
  "text": $(p):text
}
```

`watch` and `await` produce reactive expressions. Access them via `compile(src).reactive?.(root)`.

## Expression fields

A parenthesized pipeline in field position evaluates to an object and merges its keys directly into the enclosing object, without an intermediate key.

```html
<div class="seller">
  <span class="name">Homer's Donuts</span>
</div>
<div id="gmap" data-lat="41.015137" data-lon="28.979530"></div>
```

```
{
  "seller": $(.seller) {
    "name": $(.name):text
  },
  ($(#gmap) {
    "latitude": $:data(lat) | number,
    "longitude": $:data(lon) | number
  })
}
```

Produces

```json
{
  "seller": { "name": "Homer's Donuts" },
  "latitude": 41.015137,
  "longitude": 28.979530
}
```

If the selector does not match, the expression contributes zero keys silently. The `?` omit flag has the same effect.

## Nested fields

Fields can be nested by providing a block after a selector. The block executes with the selected element as the new context `$`.

```html
<div class="location">
  <span>Istanbul</span>
  <a href="/explore/locations/123">View map</a>
</div>
```

```
{
  "location": $(.location) {
    "name": $(span):text,
    "link": $(a):attr(href) | url
  }
}
```

## Lists

`$$` produces an array. Each item in the block receives one matched element as `$`.

```html
<ul>
  <li>
    <h3>Homer</h3>
    <a href="/comments/1">1 like</a>
  </li>
  <li>
    <h3>Bart</h3>
    <a href="/comments/2">5 likes</a>
  </li>
</ul>
```

```
{
  "comments": $$(ul > li) {
    "username": $(h3):text,
    "postedAt": $(time):attr(datetime) | date,
    "likes": $(a):text | regex("[0-9,]+") | number
  }
}
```

## Variants

When a field can have multiple shapes depending on what's on the page, list them in order. The first variant whose `$source` resolves to a non-null element is used.

```html
<video src="blob:..."></video>
```

```
{
  "media": match {
    $(video[src^=blob]) => {
      "type": "video",
      "video": $ | media
    }
    $([role=presentation] ul) => {
      "type": "carousel",
      "images": $$(li img) | media
    }
    $([role=button] img) => {
      "type": "image",
      "image": $ | media
    }
    _ => fail("could not find a matching media")
  }
}
```

When no selector is provided, the variant always matches and acts as a fallback.

```
{
  "count": match {
    $(span:has([aria-label=Comment])) => {
      "tag": "count_enabled",
      "value": $:text | expandSuffix | number
    }
    _ => {
      "tag": "count_disabled"
    }
  }
}
```

## Omitting missing fields

Append `?` after a selector to omit the key entirely when the element is not found rather than producing `null`.

```
{
  "location": $([href^="/explore/locations"])? {
    "name": $:text,
    "link": $:attr(href) | url
  }
}
```

## Real-world examples

### Instagram post

```html
<article>
  <header>
    <a role="link"><img src="avatar.jpg" /></a>
  </header>
  <div>
    <span><div><div><span>Great photo!</span></div></div></span>
  </div>
  <section>
    <span><button aria-label="Like"></button></span>
    <button role="button">42.1K</button>
    <span><button aria-label="Comment"></button></span>
    <button role="button">1,234</button>
  </section>
  <ul>
    <div><div><div>
      <div>
        <h3>bart_s</h3>
        <div>nice shot</div>
        <a href="/p/abc"><time datetime="2024-06-15T12:00:00Z">June 15</time></a>
        <button>5 likes</button>
      </div>
    </div></div>
  </ul>
</article>
```

```
{
  "post": {
    "description": $(div + hr + div div > span > div > div + span):text,
    "user": {
      "avatar": $(div + hr + div a[role=link] img) | media
    }
  },
  "likeCount": $(span:has([aria-label=Like], [aria-label=Unlike]) + [role=button])
           ?? $([role=presentation] > div > section + section div[role=button] > .html-span)
           | expandSuffix | number,
  "comments": {
    "list": $$(ul > div > div > div > div:has(> ul > div[role=button])) {
      "username": $(h3):text,
      "isVerified": $([aria-label=Verified]):exists,
      "comment": $(h3 + div):text,
      "postedAt": $(time):attr(datetime) | date,
      "likes": $(a:has(time) + button):text | regex("[0-9,.]+") | number
    },
    "count": match {
      $(span:has([aria-label=Comment]) + [role=button]) => {
        "tag": "count_enabled",
        "value": $:text | expandSuffix | number
      }
      else => {
        "tag": "count_disabled"
      }
    }
  }
}
```

### Instagram profile

```html
<section>
  <img alt="Homer Simpson's profile picture" src="profile.jpg" />
</section>
<section>
  <div>
    <a href="/homersimpson/followers/"><span title="1,234,567">1.2M</span></a>
    <a href="/homersimpson/following/"
      ><span
        ><span><span>890</span></span></span
      ></a
    >
    <div><span>Homer Simpson</span></div>
  </div>
  <div>
    <div><span>Just a guy from Springfield</span></div>
  </div>
</section>
```

```
{
  "profilePicture": $(header img[alt*="profile picture"])? | media,
  "followerCount": $(section:has(canvas, img) + section a[href$="/followers/"] span[title]):attr(title) | expandSuffix | number,
  "followingCount": $(section:has(canvas, img) + section a[href$="/following/"] > span > span > span):text | expandSuffix | number,
  "nickname": $(section:has(canvas, img) + section div > span):text,
  "isVerified": $(section:has(canvas, img) + section [aria-label=Verified]):exists,
  "description": $(section:has(canvas, img) + section > :nth-child(2) > div span):text,
  "posts": $$(header + div + div > div > div a:has(img:not([alt$="profile picture"]))) {
    "isPinned": $([aria-label="Pinned post icon"]):exists,
    "kind": match {
      $([aria-label=Carousel]) => "carousel"
      $([aria-label=Clip]) => "clip"
      $([aria-label!="Pinned post icon"]) => "image"
      _ => null
    },
    "link": $:attr(href) | url,
    "preview": $(img)? | media
  }
}
```

### Sahibinden listing

```html
<table id="searchResultsTable">
  <thead>
    <tr>
      <td class="col-date">Date</td>
      <td class="col-price">Price</td>
    </tr>
  </thead>
  <tbody>
    <tr class="searchResultsItem" data-id="12345">
      <td>June 10</td>
      <td class="searchResultsPriceValue">1,250,000 TL</td>
    </tr>
  </tbody>
</table>
<div id="gmap" data-lat="41.015137" data-lon="28.979530"></div>
```

```
{
  "headers": $$(#searchResultsTable thead td) {
    "name": $:text | trim(outside, inside),
    "class": $:attr(class)
  },
  "latitude": $(#gmap):data(lat) | number,
  "longitude": $(#gmap):data(lon) | number,
  "rows": $$(.searchResultsItem:not(.nativeAd)) {
    "id": $:data(id),
    "price": $(.searchResultsPriceValue)? :text | regex("(.+) TL", 1) | number,
    "cells": $$(td) {
      "content": $:text | trim(outside, inside)
    }
  }
}
```
