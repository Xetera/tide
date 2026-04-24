import { JsonataExpression } from '~/extraction/jsonata-bindings'
import { EntityValidator, type IdentityWarning } from '~/extraction/entity-validator'
import { allSites } from '~/sites'
import type { EntityPatch } from '~/site-spec/types'

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
    const expr = new JsonataExpression(expression, {
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
    return { patches: [], validationErrors: [], identityWarnings: [] as IdentityWarning[], raw: undefined, error: msg }
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
