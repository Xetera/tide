import type { Entity } from '~/site-spec/types'
import type { CaptureEntry } from './types'

const MAX_BODY_IN_PROMPT = 8_000

const BINDINGS_REFERENCE = `
## Available JSONata bindings

- \`$image(url: string)\` → \`{ _type: "image", url, hash: "" }\`
- \`$video(url: string)\` → \`{ _type: "video", url, hash: "" }\`
- \`$with_dimensions(media, width, height)\` → adds \`width\` and \`height\` to a media object
- \`$unique_id(obj, id)\` → adds \`_id\` to an object, returns \`{ _id: string, ...obj }\`. Returns null if id is null.
- \`$ref(id: string | string[])\` → \`{ _type: "ref", _id: id }\` or array of refs
- \`$timestamp(value: number | string)\` → ISO 8601 string
- \`$request.url\`, \`$request.method\`, \`$request.headers\`
- \`$response.url\`, \`$response.status\`, \`$response.headers\`, \`$response.body\`

Entity objects must have \`_entity\` (string entity name like "@site/type") and \`_id\` (unique identifier).
Relationships use \`$ref\`. Media uses \`$image\` or \`$video\`, optionally chained with \`$with_dimensions\` and \`$unique_id\`.
`.trim()

const OUTPUT_FORMAT = `
## Required output format

Return a JSON object with these fields:
- \`jsonataExpression\`: the JSONata expression string
- \`suggestedFunnelName\`: short camelCase name for the funnel
- \`suggestedRequestUrl\`: URL pattern like \`/api/path/to/:param\`
- \`suggestedRequestMethod\`: HTTP method
- \`potentialEntities\`: markdown list of additional entity types noticed in the response that aren't currently being extracted, with a brief note on available fields. Format as \`- \`@site/entity-name\`: description\`

The \`jsonataExpression\` MUST return a flat array \`[...]\` at the top level — never a single object. Include every identifiable entity (users, posts, comments, etc.) as separate elements in that array. If the response contains 10 users and 5 posts, the array should have 15 elements.

Do not deduplicate or filter for uniqueness — emit every entity you find, even if the same ID appears multiple times. The backend handles deduplication via upsert.

The expression must be formatted across multiple lines — use \`\\n\` for newlines since it is a JSON string value. Add comments (using \`/* ... */\`) explaining non-obvious field mappings, especially for union types, media fields, and relationships. Do not write the expression as a single line.
`.trim()

export interface PromptExample {
  funnelName: string
  expression: string
  fixtureSnippet: string
}

export interface BuildPromptOptions {
  captures: CaptureEntry[]
  previousErrors: string[]
  examples: PromptExample[]
  entities: Entity[]
  currentExpression?: string
  userNote?: string
}

export function buildPrompt(opts: BuildPromptOptions): string {
  const parts: string[] = []

  parts.push(`You are a JSONata expression writer for Tide, a browser extension that extracts structured entity data from website network responses.

Your task: given one or more captured HTTP request/response pairs, write a JSONata expression that extracts every identifiable entity from the response. Also identify any entity types present in the response that could be useful to track but aren't being extracted.`)

  parts.push(BINDINGS_REFERENCE)
  parts.push(OUTPUT_FORMAT)

  if (opts.entities.length > 0) {
    parts.push(`## Known entity schemas for this site

These are the existing entity definitions. Your expression must produce output that conforms to these schemas where applicable. Pay close attention to union types — fields like \`media\` require a \`kind\` discriminator field alongside the media object.

${opts.entities.map((e) => `### ${e.entity}\n\`\`\`json\n${JSON.stringify(e.fields, null, 2)}\n\`\`\``).join('\n\n')}`)
  }

  if (opts.examples.length > 0) {
    parts.push('## Examples')
    for (const example of opts.examples.slice(0, 3)) {
      parts.push(`### Loader: ${example.funnelName}

Input (truncated):
\`\`\`json
${example.fixtureSnippet}
\`\`\`

Expression:
\`\`\`jsonata
${example.expression}
\`\`\``)
    }
  }

  parts.push('## Captured requests')
  for (const capture of opts.captures) {
    const body = capture.responseBody.slice(0, MAX_BODY_IN_PROMPT)
    const truncated =
      capture.responseBody.length > MAX_BODY_IN_PROMPT ? ' (truncated)' : ''
    parts.push(`### ${capture.method} ${capture.url} → ${capture.status}

Response body${truncated}:
\`\`\`json
${body}
\`\`\``)
  }

  if (opts.userNote?.trim()) {
    parts.push(
      `## Additional instructions from user\n\n${opts.userNote.trim()}`,
    )
  }

  if (opts.currentExpression?.trim()) {
    parts.push(
      `## Current expression (modify or replace as needed)\n\`\`\`jsonata\n${opts.currentExpression}\n\`\`\``,
    )
  }

  if (opts.previousErrors.length > 0) {
    parts.push(`## Validation errors from previous attempt

Your previous attempt produced these errors — fix them:

${opts.previousErrors.map((e) => `- ${e}`).join('\n')}`)
  }

  return parts.join('\n\n')
}

const HTMLEGY_LANGUAGE_GUIDE = `
## Htmlegy language reference

Htmlegy is a novel CSS-selector-based DSL for extracting structured data from HTML DOM trees. There is no training data for it — read this reference carefully, as the syntax differs from anything you have seen before.

### Selectors

\`$(selector)\` selects a single required element. Throws if missing.
\`$$(selector)\` selects all matching elements and maps over them.
\`$(selector)?\` selects a single optional element. Field is omitted from the output if it does not match.
\`$\` is the current context element (analogous to \`this\`).
\`@\` is the root element passed to the expression.

### Pipelines

Operations are chained with \`|\`. The value flows left to right.

\`| text\` — extract text content of the element
\`| attr(name)\` — read an HTML attribute (e.g. \`| attr(href)\`, \`| attr(src)\`)
\`| data(name)\` — read a \`data-*\` attribute without the \`data-\` prefix (e.g. \`| data(id)\` reads \`data-id\`)
\`| url\` — resolve a relative URL to absolute (must follow \`attr\` or \`data\`)
\`| media\` — wrap src/href as a media reference \`{ _type: "image"|"video", url }\`; reads \`src\` from \`<img>\`/\`<video>\` automatically
\`| number\` — parse text as a number, handles K/M/B suffixes
\`| number(locale: 'tr')\` — parse with locale-specific decimal/thousand separators
\`| trim\` — trim whitespace (both outer and inner by default)
\`| trim(outside)\` — trim only leading/trailing whitespace
\`| trim(inside)\` — collapse interior whitespace runs
\`| regex("pattern")\` — extract first regex match
\`| regex("pattern", N)\` — extract capture group N (1-indexed)
\`| expandSuffix\` — expand K→×1000, M→×1000000 before \`number\`
\`| date\` — parse as Date
\`| lowercase\` — lowercase the string
\`| exists\` — returns true if element matched, false otherwise
\`| merge\` — merge an array of objects into one object

### Blocks

A block \`{ ... }\` following a selector evaluates its fields with the matched element as context:

\`$(selector) { "key": expr }\` — single element
\`$$(selector) { "key": expr }\` — produces an array

Inside a block, \`$\` refers to the current iteration element.

### Objects and arrays

\`{ "key": expr, "key2": expr2 }\` — object literal
\`[ expr, expr2 ]\` — array literal; array-valued items are flattened in
\`{ (pipeline_expr) }\` — spread: evaluates pipeline_expr as an object and merges its keys into the parent
\`{ [pipeline_expr]: value_expr }\` — dynamic key: use the pipeline result as the key name

### Null coalescing

\`expr ?? fallback_expr\` — use fallback if the left side is null or the selector matched nothing

### Conditionals

\`expr ? then_expr : else_expr\` — ternary
\`expr ? then_expr\` — omit the field entirely if falsy (no else branch)

### Match expression

\`match { $(sel1) => expr1   $(sel2) => expr2   _ => fallback }\`

The first selector that matches wins. \`_\` is an unconditional fallback.

### Alias \`@name\`

\`@name $$(selector) { ... }\` — binds each outer element to \`@name\` so it can be referenced from inside a nested \`$$\` block.

### Scoped expression \`.()\`

\`expr.(inner_expr)\` — evaluate \`inner_expr\` with \`expr\`'s matched element as context.

### Frontmatter (optional, file-level)

Lines before the expression:
\`url = /some/path\` — URL pattern the funnel matches

---

## Annotated examples

### 1. Extract a list of items

HTML:
\`\`\`html
<ul>
  <li data-id="1"><a href="/p/1">First post</a><img src="/img/1.jpg"></li>
  <li data-id="2"><a href="/p/2">Second post</a><img src="/img/2.jpg"></li>
</ul>
\`\`\`

Expression:
\`\`\`htmlegy
$$(ul > li) {
  "_entity": "@site/post",
  "_id": $ | data(id),
  "title": $(a) | text | trim,
  "url": $(a) | attr(href) | url,
  "image": $(img) | media
}
\`\`\`

Key points: \`$$(ul > li)\` maps over every \`<li>\`, so the result is an array. Inside the block, \`$\` is each \`<li>\`. \`data(id)\` reads \`data-id\`. \`| url\` makes the href absolute.

### 2. Single entity with nested sub-items

HTML:
\`\`\`html
<div class="profile" data-uid="42">
  <h1>Alice</h1>
  <img class="avatar" src="/avatars/alice.jpg">
  <ul class="posts">
    <li data-post-id="10"><p>Hello world</p></li>
    <li data-post-id="11"><p>Second post</p></li>
  </ul>
</div>
\`\`\`

Expression:
\`\`\`htmlegy
$(.profile) {
  "_entity": "@site/profile",
  "_id": $ | data(uid),
  "name": $(h1) | text | trim,
  "avatar": $(img.avatar) | media,
  "posts": $$(.posts li) {
    "id": $ | data(post-id),
    "text": $(p) | text | trim
  }
}
\`\`\`

### 3. Optional fields and fallback selectors

HTML:
\`\`\`html
<article>
  <h2>Title</h2>
  <video src="https://cdn.example.com/clip.mp4"></video>
</article>
\`\`\`

Expression:
\`\`\`htmlegy
$(article) {
  "_entity": "@site/item",
  "_id": $(h2) | text | trim,
  "title": $(h2) | text | trim,
  "thumbnail": $(img)? | media ?? $(video)? | media
}
\`\`\`

\`$(img)?\` is optional — no error if absent. \`??\` tries the video fallback if the image is null.

### 4. Alias to reference a parent element from inside a nested block

HTML:
\`\`\`html
<ul>
  <li data-list-id="42">
    <a href="/posts/1">First</a>
    <a href="/posts/2">Second</a>
  </li>
</ul>
\`\`\`

Expression:
\`\`\`htmlegy
@row $$(ul > li) {
  "items": $$(a) {
    "href": $ | attr(href),
    "listId": @row | data(list-id)
  }
}
\`\`\`

\`@row\` captures each \`<li>\` so it is reachable from inside the inner \`$$(a)\` block.

### 5. Match expression for discriminated types

HTML:
\`\`\`html
<div class="media-block">
  <video src="blob:https://example.com/x"></video>
</div>
\`\`\`

Expression:
\`\`\`htmlegy
$(.media-block) {
  "mediaType": match {
    $(video[src^=blob]) => "video"
    $(video) => "video-remote"
    $(img) => "image"
    _ => null
  },
  "media": $(video)? | media ?? $(img)? | media
}
\`\`\`

### 6. Dynamic object keys and merge

HTML:
\`\`\`html
<ul class="attrs">
  <li><strong>Color</strong><span>Red</span></li>
  <li><strong>Size</strong><span>XL</span></li>
</ul>
\`\`\`

Expression:
\`\`\`htmlegy
$$(.attrs li) {
  [$(strong) | text | trim]: $(span) | text | trim
} | merge
\`\`\`

Produces \`{ "Color": "Red", "Size": "XL" }\`.

### 7. Numbers with locales and suffixes

\`\`\`htmlegy
{
  "price": $(.price) | text | regex("([\\d.,]+)", 1) | number(locale: 'tr'),
  "followers": $(.followers) | text | number
}
\`\`\`

\`number\` handles K/M/B suffixes automatically (e.g. \`1.5K\` → 1500).

### 8. Spread inline expr into parent object

\`\`\`htmlegy
{
  "_entity": "@site/listing",
  "_id": $(.id) | data(id),
  "title": $(h1) | text | trim,
  ($(.location) {
    "latitude": $ | data(lat) | number,
    "longitude": $ | data(lon) | number
  })
}
\`\`\`

The parenthesised block is spread into the parent object.

### 9. Real-world listing page (sahibinden.com style)

\`\`\`htmlegy
[
  {
    "_entity": "@sahibinden/listing",
    "_id": $(.classifiedId) | data(classifiedid),
    "name": $(.classifiedDetailTitle h1) | text | trim,
    "price":
      $(.classified-price-wrapper) | text | regex("(.+) TL", 1)
      | trim
      | number(locale: 'tr'),
    "attributes": $$(.classifiedInfoList li) {
      [$(strong) | text | trim]: $(span) | text | trim
    } | merge,
    ($(\`#gmap\`) {
      "latitude": $ | data(lat) | number,
      "longitude": $ | data(lon) | number
    })
  },
  $$(.megaPhotoThmbItem) {
    "_entity": "@sahibinden/image",
    "_id": $ | data(img-index),
    "image": $(img) | data(source) | url
  }
]
\`\`\`
`.trim()

const MAX_HTML_IN_PROMPT = 30_000

export interface BuildHtmlegyPromptOptions {
  html: string
  entity: string
  currentExpression?: string
  userNote?: string
  previousErrors?: string[]
}

export function buildHtmlegyPrompt(opts: BuildHtmlegyPromptOptions): string {
  const parts: string[] = []

  parts.push(`You are an htmlegy expression writer for Tide, a browser extension that extracts structured entity data from website HTML pages.

Htmlegy is a custom DSL with no existing training data. You must follow the reference below exactly — do not invent syntax or mix in CSS/JS/JSONata conventions.

Your task: given the HTML source of a page, write an htmlegy expression that extracts every identifiable entity of the target type.

Target entity: \`${opts.entity || 'unknown'}\``)

  parts.push(HTMLEGY_LANGUAGE_GUIDE)

  const truncatedHtml = opts.html.slice(0, MAX_HTML_IN_PROMPT)
  const truncated = opts.html.length > MAX_HTML_IN_PROMPT ? ' (truncated)' : ''
  parts.push(`## Page HTML${truncated}

\`\`\`html
${truncatedHtml}
\`\`\``)

  if (opts.userNote?.trim()) {
    parts.push(
      `## Additional instructions from user\n\n${opts.userNote.trim()}`,
    )
  }

  if (opts.currentExpression?.trim()) {
    parts.push(
      `## Current expression (modify or replace as needed)\n\`\`\`htmlegy\n${opts.currentExpression}\n\`\`\``,
    )
  }

  if (opts.previousErrors && opts.previousErrors.length > 0) {
    parts.push(`## Errors from previous attempt

Your previous attempt produced these errors — fix them:

${opts.previousErrors.map((e) => `- ${e}`).join('\n')}`)
  }

  parts.push(`## Required output format

Return a JSON object with one field:
- \`htmlegyExpression\`: the complete htmlegy expression string. Use \\n for newlines since this is a JSON string value. Do not wrap in markdown fences.`)

  return parts.join('\n\n')
}
