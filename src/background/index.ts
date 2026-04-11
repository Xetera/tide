import { onMessage } from 'webext-bridge/background'
import { Client } from '~/server/client'
import { ServerAutonomy, type PageSpec } from '~/site-spec/types'
import { instagramSite } from '~/sites/instagram'
import { generateUID } from '~/shared'
import { type BrowserStorageSchema, Storage } from '~/shared/storage'
import { log } from './backend-logger'
import { ContentScriptTracker } from './content-script-tracker'
import { addDisableChipsListener } from './cookie'
import {
  addIframeSecurityListener,
  disableIframeSecurity,
} from './iframe-security'
import { StorageListener } from './storage-listener'
import { EntityValidator } from '~/extraction/entity-validator'
import { JsonataExpression } from '~/extraction/jsonata-bindings'
import { buildPrompt, type PromptExample } from '~/generation/prompt-builder'
import type {
  CaptureEntry,
  GenerationAttempt,
  GenerationResult,
} from '~/generation/types'

const storage = new Storage<BrowserStorageSchema>()

const CAPTURE_RING_MAX = 10

function hostnameFromUrl(url: string): string {
  try {
    return new URL(url).hostname
  } catch {
    return url
  }
}

async function getCaptureIndex(hostname: string): Promise<string[]> {
  const result = await chrome.storage.session.get({
    [`capture-index:${hostname}`]: [],
  })
  return result[`capture-index:${hostname}`] as string[]
}

async function getCaptureById(id: string): Promise<CaptureEntry | undefined> {
  const result = await chrome.storage.session.get(`capture:${id}`)
  return result[`capture:${id}`] as CaptureEntry | undefined
}

async function getCapturesForHostname(
  hostname: string,
): Promise<CaptureEntry[]> {
  const ids = await getCaptureIndex(hostname)
  const entries = await Promise.all(ids.map(getCaptureById))
  return entries.filter((e): e is CaptureEntry => e !== undefined)
}

async function storeCaptureEntry(entry: CaptureEntry) {
  const ids = await getCaptureIndex(entry.hostname)
  const next = [entry.id, ...ids.filter((id) => id !== entry.id)].slice(
    0,
    CAPTURE_RING_MAX,
  )
  const evicted = ids.filter((id) => !next.includes(id))
  await chrome.storage.session.set({
    [`capture:${entry.id}`]: entry,
    [`capture-index:${entry.hostname}`]: next,
  })
  if (evicted.length > 0) {
    await chrome.storage.session.remove(evicted.map((id) => `capture:${id}`))
  }
}

const allLoaderModules = import.meta.glob('../sites/*/loaders/*/*.jsonata', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>

const allFixtureModules = import.meta.glob('../sites/*/loaders/*/*.json', {
  import: 'default',
  eager: true,
}) as Record<string, unknown>

function buildBuiltinExamples(): PromptExample[] {
  const examples: PromptExample[] = []
  for (const [path, expression] of Object.entries(allLoaderModules)) {
    const match = path.match(
      /\/sites\/([^/]+)\/loaders\/([^/]+)\/(.+\.jsonata)$/,
    )
    if (!match) {
      continue
    }
    const [, , loaderName] = match
    const dir = path.slice(0, path.lastIndexOf('/') + 1)
    const fixturePath = Object.keys(allFixtureModules).find((p) => {
      const fixtureDir = p.slice(0, p.lastIndexOf('/') + 1)
      return fixtureDir === dir
    })
    const fixture = fixturePath ? allFixtureModules[fixturePath] : undefined
    const fixtureSnippet = fixture
      ? JSON.stringify(fixture, null, 2).slice(0, 3_000)
      : ''
    examples.push({ loaderName: loaderName!, expression, fixtureSnippet })
    if (examples.length >= 3) {
      break
    }
  }
  return examples
}

const BUILTIN_EXAMPLES = buildBuiltinExamples()

let validator: EntityValidator | null = null

async function callGemini(apiKey: string, prompt: string): Promise<string> {
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
          generationConfig: { temperature: 0.2 },
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
    return data.candidates[0]!.content.parts[0]!.text
  } finally {
    clearTimeout(timeout)
  }
}

async function callZai(apiKey: string, prompt: string): Promise<string> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 25_000)
  try {
    const response = await fetch('https://api.z.ai/api/paas/v4/chat/completions', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: 'glm-4.1v-flash',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.2,
      }),
      signal: controller.signal,
    })
    if (!response.ok) {
      throw new Error(`z.ai API returned ${response.status}: ${await response.text()}`)
    }
    const data = (await response.json()) as { choices: { message: { content: string } }[] }
    return data.choices[0]!.message.content
  } finally {
    clearTimeout(timeout)
  }
}

async function callLLM(prompt: string, geminiKey: string, zaiKey: string): Promise<string> {
  if (zaiKey) {
    return callZai(zaiKey, prompt)
  }
  return callGemini(geminiKey, prompt)
}

function parseGeminiOutput(raw: string):
  | {
      ok: true
      jsonataExpression: string
      suggestedLoaderName: string
      suggestedRequestUrl: string
      suggestedRequestMethod: string
      potentialEntities: string
    }
  | { ok: false; error: string } {
  const match = raw.match(/```(?:json)?\s*([\s\S]*?)```/)
  if (!match) {
    return { ok: false, error: 'No code block found in model output' }
  }
  try {
    const parsed = JSON.parse(match[1]!) as Record<string, string>
    if (!parsed.jsonataExpression) {
      return { ok: false, error: 'Missing jsonataExpression in model output' }
    }
    const afterBlock = raw
      .slice(raw.indexOf('```', raw.indexOf('```') + 3) + 3)
      .trim()
    return {
      ok: true,
      jsonataExpression: parsed.jsonataExpression,
      suggestedLoaderName: parsed.suggestedLoaderName ?? 'loader',
      suggestedRequestUrl: parsed.suggestedRequestUrl ?? '/',
      suggestedRequestMethod: parsed.suggestedRequestMethod ?? 'GET',
      potentialEntities: afterBlock,
    }
  } catch (err) {
    return {
      ok: false,
      error: `Failed to parse model output JSON: ${err instanceof Error ? err.message : String(err)}`,
    }
  }
}

async function validateExpression(
  expression: string,
  capture: CaptureEntry,
): Promise<string[]> {
  if (!validator) {
    return []
  }
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
    return [err instanceof Error ? err.message : String(err)]
  }
}

const MAX_ATTEMPTS = 3

async function runGenerationLoop(
  captures: CaptureEntry[],
  geminiKey: string,
  zaiKey: string,
): Promise<GenerationResult> {
  let previousErrors: string[] = []
  const attempts: GenerationAttempt[] = []
  await storage.set('generation:attempts', [])

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    await storage.set('generation:progress', {
      stage: attempt === 1 ? 'assembling' : 'retrying',
      attempt,
      timestamp: Date.now(),
    })

    const prompt = buildPrompt({
      captures,
      previousErrors,
      examples: BUILTIN_EXAMPLES,
      entities: instagramSite.entities,
    })

    await storage.set('generation:progress', {
      stage: 'calling-api',
      attempt,
      timestamp: Date.now(),
    })

    let rawOutput: string
    try {
      rawOutput = await callLLM(prompt, geminiKey, zaiKey)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      if (attempt === MAX_ATTEMPTS) {
        return { success: false, error: `Gemini API error: ${msg}` }
      }
      previousErrors = [`API call failed: ${msg}`]
      continue
    }

    await storage.set('generation:progress', {
      stage: 'validating',
      attempt,
      timestamp: Date.now(),
    })

    const parseResult = parseGeminiOutput(rawOutput)
    if (!parseResult.ok) {
      attempts.push({
        attempt,
        jsonataExpression: '',
        validationErrors: [parseResult.error],
      })
      await storage.set('generation:attempts', [...attempts])
      if (attempt === MAX_ATTEMPTS) {
        return { success: false, error: parseResult.error }
      }
      previousErrors = [parseResult.error]
      continue
    }

    const validationErrors = await validateExpression(
      parseResult.jsonataExpression,
      captures[0]!,
    )

    attempts.push({
      attempt,
      jsonataExpression: parseResult.jsonataExpression,
      validationErrors,
    })
    await storage.set('generation:attempts', [...attempts])

    if (validationErrors.length === 0) {
      await storage.set('generation:progress', {
        stage: 'done',
        attempt,
        timestamp: Date.now(),
      })
      const result: GenerationResult = {
        success: true,
        jsonataExpression: parseResult.jsonataExpression,
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
        suggestedLoaderName: parseResult.suggestedLoaderName,
        suggestedRequestUrl: parseResult.suggestedRequestUrl,
        suggestedRequestMethod: parseResult.suggestedRequestMethod,
        potentialEntities: parseResult.potentialEntities,
      }
      await storage.set('generation:last-result', {
        result,
        timestamp: Date.now(),
      })
      return result
    }

    previousErrors = validationErrors
    await storage.set('generation:progress', {
      stage: 'retrying',
      attempt,
      validationErrors,
      timestamp: Date.now(),
    })
  }

  return {
    success: false,
    error: `Validation failed after ${MAX_ATTEMPTS} attempts`,
  }
}

function emitUrlUpdate(
  details: chrome.webNavigation.WebNavigationTransitionCallbackDetails,
) {
  if (details.parentDocumentId !== undefined) {
    // request sent from our iframe
    return
  }
  chrome.tabs
    .sendMessage(details.tabId, { type: 'url-update', url: details.url })
    .catch(() => {})
}
;(async () => {
  const origins = ['webhook.site', 'instagram.com', 'www.sahibinden.com']
  let client: Client | undefined

  try {
    const cst = new ContentScriptTracker()
    chrome.webNavigation.onHistoryStateUpdated.addListener(emitUrlUpdate, {
      url: origins.map((origin) => ({ hostContains: origin })),
    })

    const serverUrl = await storage.get('server:url', '')
    const serverName = await storage.get('server:name', '')
    const poolId = await storage.get('server:pool-id', '')
    const autonomy = await storage.get(
      'server:autonomy',
      ServerAutonomy.Passive,
    )

    let workerId = await storage.get('server:worker-id', '')
    if (!workerId) {
      workerId = crypto.randomUUID()
      await storage.set('server:worker-id', workerId)
    }

    const workerSecret = await storage.get('server:worker-secret', '')

    client = new Client({
      cst,
      pollIntervalSeconds: 30,
      queueIntervalSeconds: 1,
      defaultServers: [
        {
          id: generateUID(),
          name: serverName,
          url: serverUrl,
          autonomy,
          poolId,
          workerId,
          workerSecret,
        },
      ],
      async enabledResources(_server) {
        return storage.get('enabledResources', [])
      },
      onPatches(emission) {
        storage.set('scrape:last', emission)
      },
      async onResourcesUpdated(server, resources) {
        const tabIds = await cst.getAllScriptTabs()
        storage.set(
          'enabledResources',
          resources.map((resource) => resource.$entity),
        )
        storage.set('resources:all', resources)
        const hostnames = resources.map((re) => re.$hostname)
        disableIframeSecurity(hostnames)
        for (const tabId of tabIds) {
          chrome.tabs
            .sendMessage(tabId, { type: 'update-resources', resources })
            .catch(() => {})
        }
        chrome.webNavigation.onHistoryStateUpdated.removeListener(emitUrlUpdate)
        chrome.webNavigation.onHistoryStateUpdated.addListener(emitUrlUpdate, {
          url: resources.map((resource) => ({
            hostContains: resource.$hostname,
          })),
        })
      },
    })

    disableIframeSecurity(origins)
    addIframeSecurityListener()
    addDisableChipsListener(origins)

    onMessage('set-schema', ({ data }) => {
      storage.set('schema:local', JSON.stringify(data))
      storage.set('resources:all', data)
      client!.setResources(client!.getServer(), data)
    })
    onMessage('toggle-resource', () => {})
    onMessage('log', ({ data }) => {
      log(data)
    })
    onMessage('raw-capture', async ({ data }) => {
      const hostname = hostnameFromUrl(data.url)
      await storeCaptureEntry({
        id: crypto.randomUUID(),
        hostname,
        url: data.url,
        method: data.method,
        status: data.status,
        requestBody: data.requestBody,
        responseBody: data.responseBody,
        requestHeaders: data.requestHeaders,
        responseHeaders: data.responseHeaders,
        capturedAt: data.capturedAt,
      })
    })
    onMessage('get-captures', async ({ data }) => {
      return getCapturesForHostname(data.hostname)
    })
    onMessage('generate-spec', async ({ data }) => {
      const captures = (
        await Promise.all(data.selectedCaptureIds.map(getCaptureById))
      ).filter((e): e is CaptureEntry => e !== undefined)
      if (captures.length === 0) {
        return {
          success: false,
          error: 'No captures found for selected IDs',
        } as const
      }
      const geminiKey = await storage.get('gemini:api-key', '')
      const zaiKey = await storage.get('zai:api-key', '')
      if (!geminiKey && !zaiKey) {
        return {
          success: false,
          error: 'No API key configured in settings (Gemini or z.ai)',
        } as const
      }
      return runGenerationLoop(captures, geminiKey ?? '', zaiKey ?? '')
    })

    const storageListener = new StorageListener()

    storageListener.on('server:worker-secret', (workerSecret) => {
      client!.updateServer({ workerSecret })
    })

    storageListener.on('server:pool-id', (poolId) => {
      client!.updateServer({ poolId })
    })

    storageListener.on('server:url', (url) => {
      client!.updateServer({ url })
    })

    storageListener.on('server:enabled', (enabled) => {
      if (enabled) {
        log({
          severity: 'info',
          text: 'Server enabled, starting...',
        })
        client!.start(client!.getServer())
      } else {
        log({
          severity: 'info',
          text: 'Server disabled, stopping...',
        })
        client!.stop(client!.getServer())
      }
    })

    validator = new EntityValidator([instagramSite])

    const localSchema = await storage.get('schema:local', '')
    const defaultResources = instagramSite.pages
    const resources: PageSpec[] = localSchema
      ? (() => {
          try {
            return JSON.parse(localSchema)
          } catch {
            return defaultResources
          }
        })()
      : defaultResources
    client.setResources(client.getServer(), resources)
    storage.set('resources:all', resources)

    await client.startAll()
  } catch (err) {
    console.error(err)
  }
})()
