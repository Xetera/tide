# rehype-demo

Scratch project for comparing what `rehype-parse` produces from real HTML against a compact node-tree shape and a markdown conversion.

## Setup

```sh
cd experiments/rehype-demo
bun install
```

## Run

```sh
bun run demo ./path/to/file.html
```

Output shows four views of the same input:

1. Raw HAST from `rehype-parse`
2. Sanitized HAST (`rehype-sanitize` with images + figure allowed)
3. A custom compact node tree (`{ tag, attrs, children }`)
4. Markdown via `rehype-remark` + `remark-stringify`

The compact shape is the one closest to what a PageSpec `_type: richtext` field could emit, with media nodes carrying the same `{hash, token, source}` envelope used elsewhere in MEDIA_PROTOCOL.
