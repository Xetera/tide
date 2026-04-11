import type { Entity } from '~/site-spec/types'
import type { CaptureEntry } from './types'

const MAX_BODY_IN_PROMPT = 8_000

const BINDINGS_REFERENCE = `
## Available JSONata bindings

- \`$image(url: string)\` → \`{ _type: "image", url, hash: "" }\`
- \`$video(url: string)\` → \`{ _type: "video", url, hash: "" }\`
- \`$with_dimensions(media, width, height)\` → adds \`width\` and \`height\` to a media object
- \`$unique_id(obj, id)\` → adds \`_id\` to an object, returns \`{ _id: string, ...obj }\`. Returns null if id is null.
- \`$ref(entityName: string, id: string | string[])\` → \`{ _ref: entityName, id }\` or array of refs
- \`$entity(fields, entityName: string)\` → adds \`_entity\` to an object or array of objects
- \`$timestamp(value: number | string)\` → \`{ _type: "timestamp", value: ISO string, precision: "full" }\`
- \`$request.url\`, \`$request.method\`, \`$request.headers\`
- \`$response.url\`, \`$response.status\`, \`$response.headers\`, \`$response.body\`

Entity objects must have \`_entity\` (string entity name like "@site/type") and \`_id\` (unique identifier).
Relationships use \`$ref\`. Media uses \`$image\` or \`$video\`, optionally chained with \`$with_dimensions\` and \`$unique_id\`.
`.trim()

const OUTPUT_FORMAT = `
## Required output format

Respond with a JSON code block followed by a markdown list. No other text.

The JSON block contains the JSONata expression and request matcher:

\`\`\`json
{
  "jsonataExpression": "...",
  "suggestedLoaderName": "...",
  "suggestedRequestUrl": "/api/path/to/:param",
  "suggestedRequestMethod": "GET"
}
\`\`\`

The \`jsonataExpression\` must extract ALL identifiable entities from the response — not just one type. Include every distinct object that has a stable ID (users, posts, comments, media, etc.) as a separate entity in the output array.

The expression must be formatted across multiple lines with comments (using \`/* ... */\`) explaining non-obvious field mappings, especially for union types, media fields, and relationships. Do not write the expression as a single line.

After the JSON block, include a markdown list of additional entity types you noticed in the response that aren't currently being extracted, with a brief note on what fields are available:

## Potential additional entities
- \`@site/entity-name\`: description of what it is and what fields are available
`.trim()

export interface PromptExample {
  loaderName: string
  expression: string
  fixtureSnippet: string
}

export interface BuildPromptOptions {
  captures: CaptureEntry[]
  previousErrors: string[]
  examples: PromptExample[]
  entities: Entity[]
}

export function buildPrompt(opts: BuildPromptOptions): string {
  const parts: string[] = []

  parts.push(`You are a JSONata expression writer for Spatula, a browser extension that extracts structured entity data from website network responses.

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
      parts.push(`### Loader: ${example.loaderName}

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

  if (opts.previousErrors.length > 0) {
    parts.push(`## Validation errors from previous attempt

Your previous attempt produced these errors — fix them:

${opts.previousErrors.map((e) => `- ${e}`).join('\n')}`)
  }

  return parts.join('\n\n')
}
