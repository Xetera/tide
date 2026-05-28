#!/usr/bin/env node
import openapiTS, { astToString } from 'openapi-typescript'
import { writeFile, mkdir } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const SOURCE = process.env.SHOAL_OPENAPI_URL ?? 'http://localhost:4000/api/openapi'
const OUTPUT = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  'src',
  'generated',
  'shoal-api.ts',
)

const ast = await openapiTS(new URL(SOURCE))
const contents = astToString(ast)

const banner = `/**
 * Auto-generated from Shoal's OpenAPI spec. Do not edit by hand.
 * Regenerate with: pnpm api:types
 * Source: ${SOURCE}
 */

`

await mkdir(dirname(OUTPUT), { recursive: true })
await writeFile(OUTPUT, banner + contents)

console.log(`wrote ${OUTPUT}`)
