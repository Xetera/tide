import { JsonataExpression } from '@tide/jsonata'
import {
  EntityValidator,
  type IdentityWarning,
} from '@tide/spec'
import { allSites } from '@tide/sites'
import type { RawEntityPatch } from '@tide/spec'
import { createExpr } from '@tide/htmlegy-dom'
import { parseFrontmatter } from '@tide/frontmatter'

export const validator = new EntityValidator(allSites)

export interface EvalResult {
  patches: unknown[]
  validationErrors: string[]
  identityWarnings: IdentityWarning[]
  raw: unknown
  error?: string
}

export async function evaluate(
  expression: string,
  input: unknown,
  url: string,
  method: string,
  headers: Record<string, string>,
): Promise<EvalResult> {
  try {
    const { body } = parseFrontmatter(expression)
    const expr = new JsonataExpression(body, {
      request: { url, method, headers },
      response: { url, status: null, headers: {}, body: input },
    })
    const raw = await expr.evaluate(input)
    const { patches: rawPatches, errors } = validator.parsePatches(raw ?? [])
    const { patches, warnings: identityWarnings } =
      validator.applyIdentityExprs(rawPatches)
    const validationErrors = errors.map(
      (e) => `${e.entity}${e.path}: ${e.message}`,
    )
    return { patches, validationErrors, identityWarnings, raw }
  } catch (err) {
    const msg =
      err instanceof Error
        ? err.message
        : ((err as { message?: string })?.message ?? String(err))
    return {
      patches: [],
      validationErrors: [],
      identityWarnings: [] as IdentityWarning[],
      raw: undefined,
      error: msg,
    }
  }
}

export function htmlegyToPatches(
  entity: string,
  result: unknown,
): RawEntityPatch[] {
  if (Array.isArray(result)) {
    return result.filter(
      (item): item is RawEntityPatch =>
        typeof item === 'object' && item !== null && '_entity' in item,
    )
  }
  if (typeof result === 'object' && result !== null && '_entity' in result) {
    return [result as RawEntityPatch]
  }
  if (typeof result === 'object' && result !== null) {
    return [
      { _entity: entity, _id: '', ...(result as Record<string, unknown>) },
    ]
  }
  return []
}

export async function evaluateHtmlegy(
  expression: string,
  entity: string,
  root: Element,
): Promise<EvalResult> {
  try {
    const { body } = parseFrontmatter(expression)
    const result = await createExpr(body).run(root)
    const patches = htmlegyToPatches(entity, result)
    return { patches, validationErrors: [], identityWarnings: [], raw: result }
  } catch (err) {
    const msg =
      err instanceof Error
        ? err.message
        : ((err as { message?: string })?.message ?? String(err))
    return {
      patches: [],
      validationErrors: [],
      identityWarnings: [],
      raw: undefined,
      error: msg,
    }
  }
}

export function relativeTime(ts: number): string {
  const diff = Date.now() - ts
  if (diff < 60_000) {
    return `${Math.floor(diff / 1000)}s\u00a0ago`
  }
  if (diff < 3_600_000) {
    return `${Math.floor(diff / 60_000)}m\u00a0ago`
  }
  return `${Math.floor(diff / 3_600_000)}h\u00a0ago`
}
