import type { Entity } from '~/site-spec/types'
import { JsonataExpression } from '~/extraction/jsonata-bindings'
import { buildPrompt } from './prompt-builder'
import type { CaptureEntry, GenerationAttempt, GenerationResult } from './types'
import type { EntityValidator } from '~/extraction/entity-validator'

interface LLMOutput {
  jsonataExpression: string
  suggestedFunnelName: string
  suggestedRequestUrl: string
  suggestedRequestMethod: string
  potentialEntities: string
}

const LLM_RESPONSE_SCHEMA = {
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

async function callGemini(apiKey: string, prompt: string): Promise<LLMOutput> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 25_000)
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
            responseSchema: LLM_RESPONSE_SCHEMA,
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
    const output = JSON.parse(
      data.candidates[0]!.content.parts[0]!.text,
    ) as LLMOutput
    output.jsonataExpression = output.jsonataExpression
      .replace(/\\n/g, '\n')
      .replace(/\\t/g, '\t')
    return output
  } finally {
    clearTimeout(timeout)
  }
}

async function callZai(apiKey: string, prompt: string): Promise<LLMOutput> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 25_000)
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
          model: 'glm-4.1v-flash',
          messages: [{ role: 'user', content: prompt }],
          temperature: 0.2,
          response_format: {
            type: 'json_schema',
            json_schema: {
              name: 'LLMOutput',
              schema: LLM_RESPONSE_SCHEMA,
              strict: true,
            },
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
    const output = JSON.parse(data.choices[0]!.message.content) as LLMOutput
    output.jsonataExpression = output.jsonataExpression
      .replace(/\\n/g, '\n')
      .replace(/\\t/g, '\t')
    return output
  } finally {
    clearTimeout(timeout)
  }
}

function callLLM(
  prompt: string,
  geminiKey: string,
  zaiKey: string,
): Promise<LLMOutput> {
  if (zaiKey) {
    return callZai(zaiKey, prompt)
  }
  return callGemini(geminiKey, prompt)
}

async function validateExpression(
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

    let llmOutput: LLMOutput
    try {
      llmOutput = await callLLM(prompt, geminiKey, zaiKey)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      if (attempt === MAX_ATTEMPTS) {
        return { success: false, error: `Gemini API error: ${msg}` }
      }
      previousErrors = [`API call failed: ${msg}`]
      continue
    }

    await onProgress({ stage: 'validating', attempt })

    const validationErrors = await validateExpression(
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
