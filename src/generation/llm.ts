import type { Entity } from '~/site-spec/types'
import { JsonataExpression } from '~/extraction/jsonata-bindings'
import { buildPrompt, buildHtmlegyPrompt } from './prompt-builder'
import type { CaptureEntry, GenerationAttempt, GenerationResult } from './types'
import type { EntityValidator } from '~/extraction/entity-validator'
import { createExpr } from '@tide/htmlegy-dom'

type JsonSchema = {
  type: string
  properties: Record<string, { type: string }>
  required: string[]
}

async function callGemini<T>(
  apiKey: string,
  prompt: string,
  schema: JsonSchema,
): Promise<T> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 25_000)
  console.log('[tide] callGemini firing')
  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite-preview:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: 0.2,
            responseMimeType: 'application/json',
            responseSchema: schema,
          },
        }),
        signal: controller.signal,
      },
    )
    if (!response.ok) {
      throw new Error(
        `Gemini API returned ${response.status}: ${await response.text()}`,
      )
    }
    const data = (await response.json()) as {
      candidates: { content: { parts: { text: string }[] } }[]
    }
    return JSON.parse(data.candidates[0]!.content.parts[0]!.text) as T
  } finally {
    clearTimeout(timeout)
  }
}

async function callZai<T>(
  apiKey: string,
  prompt: string,
  schema: JsonSchema,
  schemaName: string,
): Promise<T> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 25_000)
  console.log('[tide] callZai firing')
  try {
    const response = await fetch(
      'https://api.z.ai/api/paas/v4/chat/completions',
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: 'glm-5.1',
          messages: [{ role: 'user', content: prompt }],
          temperature: 0.2,
          response_format: {
            type: 'json_schema',
            json_schema: { name: schemaName, schema, strict: true },
          },
        }),
        signal: controller.signal,
      },
    )
    if (!response.ok) {
      throw new Error(
        `z.ai API returned ${response.status}: ${await response.text()}`,
      )
    }
    const data = (await response.json()) as {
      choices: { message: { content: string } }[]
    }
    return JSON.parse(data.choices[0]!.message.content) as T
  } finally {
    clearTimeout(timeout)
  }
}

function callLLM<T>(
  prompt: string,
  geminiKey: string,
  zaiKey: string,
  schema: JsonSchema,
  schemaName: string,
): Promise<T> {
  if (zaiKey) {
    return callZai<T>(zaiKey, prompt, schema, schemaName)
  }
  return callGemini<T>(geminiKey, prompt, schema)
}

function unescapeString(s: string): string {
  return s.replace(/\\n/g, '\n').replace(/\\t/g, '\t')
}

interface JsonataLLMOutput {
  jsonataExpression: string
  suggestedFunnelName: string
  suggestedRequestUrl: string
  suggestedRequestMethod: string
  potentialEntities: string
}

const JSONATA_SCHEMA: JsonSchema = {
  type: 'object',
  properties: {
    jsonataExpression: { type: 'string' },
    suggestedFunnelName: { type: 'string' },
    suggestedRequestUrl: { type: 'string' },
    suggestedRequestMethod: { type: 'string' },
    potentialEntities: { type: 'string' },
  },
  required: [
    'jsonataExpression',
    'suggestedFunnelName',
    'suggestedRequestUrl',
    'suggestedRequestMethod',
    'potentialEntities',
  ],
}

interface HtmlegyLLMOutput {
  htmlegyExpression: string
}

const HTMLEGY_SCHEMA: JsonSchema = {
  type: 'object',
  properties: {
    htmlegyExpression: { type: 'string' },
  },
  required: ['htmlegyExpression'],
}

async function validateJsonataExpression(
  expression: string,
  capture: CaptureEntry,
  validator: EntityValidator,
): Promise<string[]> {
  let json: unknown
  try {
    json = JSON.parse(capture.responseBody)
  } catch {
    return ['Response body is not valid JSON']
  }
  try {
    const expr = new JsonataExpression(expression, {
      request: {
        url: capture.url,
        method: capture.method,
        headers: capture.requestHeaders,
      },
      response: {
        url: capture.url,
        status: capture.status,
        headers: capture.responseHeaders,
        body: json,
      },
    })
    const result = await expr.evaluate(json)
    const errors: string[] = []
    const raw =
      result === undefined ? [] : Array.isArray(result) ? result : [result]
    if (raw.length === 0) {
      return [
        'Expression evaluated successfully but produced no patches — check field mappings and that the expression returns a non-empty array',
      ]
    }
    for (const item of raw) {
      if (item === null || typeof item !== 'object' || !('_entity' in item)) {
        continue
      }
      const entityName = (item as Record<string, unknown>)._entity as string
      const validationErrors = validator.validate(entityName, item)
      for (const e of validationErrors) {
        errors.push(`${entityName}${e.path}: ${e.message}`)
      }
    }
    return errors
  } catch (err) {
    if (err instanceof Error) {
      return [err.message]
    }
    if (err !== null && typeof err === 'object' && 'message' in err) {
      return [String((err as { message: unknown }).message)]
    }
    return [String(err)]
  }
}

function validateHtmlegyExpression(expression: string): string[] {
  try {
    createExpr(expression)
    return []
  } catch (err) {
    const msg =
      err instanceof Error
        ? err.message
        : ((err as { message?: string })?.message ?? String(err))
    return [msg]
  }
}

const MAX_ATTEMPTS = 3

export interface RunGenerationOptions {
  captures: CaptureEntry[]
  geminiKey: string
  zaiKey: string
  entities: Entity[]
  validator: EntityValidator
  examples: { funnelName: string; expression: string; fixtureSnippet: string }[]
  initialExpression?: string
  userNote?: string
  onProgress: (progress: {
    stage: string
    attempt: number
    validationErrors?: string[]
  }) => Promise<void>
  onAttempts: (attempts: GenerationAttempt[]) => Promise<void>
}

export async function runGenerationLoop(
  opts: RunGenerationOptions,
): Promise<GenerationResult> {
  const {
    captures,
    geminiKey,
    zaiKey,
    entities,
    validator,
    examples,
    initialExpression,
    userNote,
    onProgress,
    onAttempts,
  } = opts
  let previousErrors: string[] = []
  let previousExpression: string | undefined = initialExpression
  const attempts: GenerationAttempt[] = []
  await onAttempts([])

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    await onProgress({
      stage: attempt === 1 ? 'assembling' : 'retrying',
      attempt,
    })

    const prompt = buildPrompt({
      captures,
      previousErrors,
      examples,
      entities,
      currentExpression: previousExpression,
      userNote: attempt === 1 ? userNote : undefined,
    })

    await onProgress({ stage: 'calling-api', attempt })

    let llmOutput: JsonataLLMOutput
    try {
      const raw = await callLLM<JsonataLLMOutput>(
        prompt,
        geminiKey,
        zaiKey,
        JSONATA_SCHEMA,
        'JsonataOutput',
      )
      llmOutput = {
        ...raw,
        jsonataExpression: unescapeString(raw.jsonataExpression),
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      if (attempt === MAX_ATTEMPTS) {
        return { success: false, error: `Gemini API error: ${msg}` }
      }
      previousErrors = [`API call failed: ${msg}`]
      continue
    }

    await onProgress({ stage: 'validating', attempt })

    const validationErrors = await validateJsonataExpression(
      llmOutput.jsonataExpression,
      captures[0]!,
      validator,
    )

    attempts.push({
      attempt,
      jsonataExpression: llmOutput.jsonataExpression,
      validationErrors,
    })
    await onAttempts([...attempts])

    if (validationErrors.length === 0) {
      await onProgress({ stage: 'done', attempt })
      return {
        success: true,
        jsonataExpression: llmOutput.jsonataExpression,
        fixtureJson: JSON.stringify(
          {
            request: {
              url: captures[0]!.url,
              method: captures[0]!.method,
              headers: captures[0]!.requestHeaders,
            },
            response: {
              status: captures[0]!.status,
              headers: captures[0]!.responseHeaders,
              body: JSON.parse(captures[0]!.responseBody),
            },
          },
          null,
          2,
        ),
        suggestedFunnelName: llmOutput.suggestedFunnelName,
        suggestedRequestUrl: llmOutput.suggestedRequestUrl,
        suggestedRequestMethod: llmOutput.suggestedRequestMethod,
        potentialEntities: llmOutput.potentialEntities,
      }
    }

    previousErrors = validationErrors
    previousExpression = llmOutput.jsonataExpression
    await onProgress({ stage: 'retrying', attempt, validationErrors })
  }

  return {
    success: false,
    error: `Validation failed after ${MAX_ATTEMPTS} attempts`,
  }
}

export type HtmlegyGenerationResult =
  | { success: true; expression: string }
  | { success: false; error: string }

export interface RunHtmlegyGenerationOptions {
  html: string
  entity: string
  geminiKey: string
  zaiKey: string
  initialExpression?: string
  userNote?: string
  onProgress: (progress: { stage: string; attempt: number }) => Promise<void>
}

export async function runHtmlegyGenerationLoop(
  opts: RunHtmlegyGenerationOptions,
): Promise<HtmlegyGenerationResult> {
  const {
    html,
    entity,
    geminiKey,
    zaiKey,
    initialExpression,
    userNote,
    onProgress,
  } = opts
  let previousErrors: string[] = []
  let previousExpression: string | undefined = initialExpression

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    await onProgress({
      stage: attempt === 1 ? 'assembling' : 'retrying',
      attempt,
    })

    const prompt = buildHtmlegyPrompt({
      html,
      entity,
      previousErrors,
      currentExpression: previousExpression,
      userNote: attempt === 1 ? userNote : undefined,
    })

    await onProgress({ stage: 'calling-api', attempt })
    console.log(
      '[tide] runHtmlegyGenerationLoop calling callLLM, geminiKey:',
      !!geminiKey,
      'zaiKey:',
      !!zaiKey,
    )

    let expression: string
    try {
      const raw = await callLLM<HtmlegyLLMOutput>(
        prompt,
        geminiKey,
        zaiKey,
        HTMLEGY_SCHEMA,
        'HtmlegyOutput',
      )
      expression = unescapeString(raw.htmlegyExpression)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      if (attempt === MAX_ATTEMPTS) {
        return { success: false, error: `API error: ${msg}` }
      }
      previousErrors = [`API call failed: ${msg}`]
      continue
    }

    await onProgress({ stage: 'validating', attempt })

    const parseErrors = validateHtmlegyExpression(expression)
    if (parseErrors.length === 0) {
      await onProgress({ stage: 'done', attempt })
      return { success: true, expression }
    }

    if (attempt === MAX_ATTEMPTS) {
      return {
        success: false,
        error: `Generated invalid htmlegy after ${MAX_ATTEMPTS} attempts: ${parseErrors[0]}`,
      }
    }

    previousErrors = parseErrors
    previousExpression = expression
  }

  return { success: false, error: 'Generation failed' }
}
