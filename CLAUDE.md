Look at @DESIGN.md always

Never put `continue` or `return` on the same line. Always write it like

```js
if (...) {
  return
}
```

instead.

Do not use `(err as any).abc` as a pattern.

`htmlegy` is an in-house DSL defined in this repo, not a public package. Do not web-search it. Canonical sources:

- `tree-sitter-htmlegy/grammar.js` — grammar
- `zed-htmlegy/` — Zed editor integration
- `packages/` and `src/` — runtime usage

Page specs in this repo use htmlegy alongside jsonata as extraction formats. The Shoal repo (`/Users/xetera/projects/shoal`) consumes these specs and references the format as `:jsonata | :htmlegy`.
