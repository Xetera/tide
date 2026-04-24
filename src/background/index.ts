import { onMessage } from 'webext-bridge/background'
import { Client } from '~/server/client'
import { ServerAutonomy, type PageSpec, type Entity } from '~/site-spec/types'
import { instagramSite } from '~/sites/instagram'
import { allSites } from '~/sites'
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
import { buildPrompt } from '~/generation/prompt-builder'
import type {
  CaptureEntry,
  GenerationAttempt,
  GenerationResult,
  LoaderMatchResult,
} from '~/generation/types'
import {
  loaderEntries,
  matchesGlob,
  captureMatchesKnownLoader,
  buildLoaderInfos,
  buildBuiltinExamples,
} from '~/loaders'

const storage = new Storage<BrowserStorageSchema>()

const CAPTURE_RING_MAX = 10

console.log(
  '[spatula] loaderEntries:',
  loaderEntries.map((e) => `${e.site}/${e.loader}/${e.file}`),
)
console.log(
  '[spatula] allSites requests:',
  allSites.map((s) => `${s.hostname}: ${Object.keys(s.requests).join(', ')}`),
)

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

const BUILTIN_EXAMPLES = buildBuiltinExamples()

let validator: EntityValidator | null = null

interface LLMOutput {
  jsonataExpression: string
  suggestedLoaderName: string
  suggestedRequestUrl: string
  suggestedRequestMethod: string
  potentialEntities: string
}

const LLM_RESPONSE_SCHEMA = {
  type: 'object',
  properties: {
    jsonataExpression: { type: 'string' },
    suggestedLoaderName: { type: 'string' },
    suggestedRequestUrl: { type: 'string' },
    suggestedRequestMethod: { type: 'string' },
    potentialEntities: { type: 'string' },
  },
  required: [
    'jsonataExpression',
    'suggestedLoaderName',
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

async function callLLM(
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

async function runGenerationLoop(
  captures: CaptureEntry[],
  geminiKey: string,
  zaiKey: string,
  entities: Entity[],
  initialExpression?: string,
  userNote?: string,
): Promise<GenerationResult> {
  let previousErrors: string[] = []
  let previousExpression: string | undefined = initialExpression
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
      entities,
      currentExpression: previousExpression,
      userNote: attempt === 1 ? userNote : undefined,
    })

    await storage.set('generation:progress', {
      stage: 'calling-api',
      attempt,
      timestamp: Date.now(),
    })

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

    await storage.set('generation:progress', {
      stage: 'validating',
      attempt,
      timestamp: Date.now(),
    })

    const validationErrors = await validateExpression(
      llmOutput.jsonataExpression,
      captures[0]!,
    )

    attempts.push({
      attempt,
      jsonataExpression: llmOutput.jsonataExpression,
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
        suggestedLoaderName: llmOutput.suggestedLoaderName,
        suggestedRequestUrl: llmOutput.suggestedRequestUrl,
        suggestedRequestMethod: llmOutput.suggestedRequestMethod,
        potentialEntities: llmOutput.potentialEntities,
      }
      await storage.set('generation:last-result', {
        result,
        timestamp: Date.now(),
      })
      return result
    }

    previousErrors = validationErrors
    previousExpression = llmOutput.jsonataExpression
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
      console.log(
        '[spatula] raw-capture received',
        data.method,
        data.url,
        `body=${data.responseBody.length}b`,
      )
      if (!captureMatchesKnownLoader(allSites, data.url, data.method)) {
        console.log(
          '[spatula] raw-capture discarded (no matching loader)',
          data.method,
          data.url,
        )
        return
      }
      try {
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
        console.log('[spatula] raw-capture stored', data.url)
      } catch (err) {
        console.error('[spatula] raw-capture store failed', data.url, err)
      }
    })
    onMessage('get-captures', async ({ data }) => {
      const captures = await getCapturesForHostname(data.hostname)
      if (!data.request) {
        return captures
      }
      const { method, url } = data.request
      return captures.filter(
        (c) =>
          c.method.toUpperCase() === method.toUpperCase() &&
          matchesGlob(url, new URL(c.url).pathname),
      )
    })
    onMessage('match-capture', async ({ data }) => {
      const capture = await getCaptureById(data.captureId)
      if (!capture) {
        return []
      }
      let json: unknown
      try {
        json = JSON.parse(capture.responseBody)
      } catch {
        return []
      }
      const results: LoaderMatchResult[] = []
      for (const entry of loaderEntries) {
        const expr = new JsonataExpression(entry.expression, {
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
        let result: unknown
        try {
          result = await expr.evaluate(json)
        } catch (err) {
          results.push({
            matched: false,
            loader: entry.loader,
            file: entry.file,
            error: err instanceof Error ? err.message : String(err),
          })
          continue
        }
        if (result === undefined) {
          results.push({
            matched: false,
            loader: entry.loader,
            file: entry.file,
          })
          continue
        }
        const raw = Array.isArray(result) ? result : [result]
        const patches = raw.filter((item) => {
          return item !== null && typeof item === 'object' && '_entity' in item
        })
        if (patches.length === 0) {
          results.push({
            matched: false,
            loader: entry.loader,
            file: entry.file,
          })
          continue
        }
        const validationErrors: string[] = []
        if (validator) {
          for (const patch of patches) {
            const name = (patch as Record<string, unknown>)._entity as string
            const errs = validator.validate(name, patch)
            for (const e of errs) {
              validationErrors.push(`${name}${e.path}: ${e.message}`)
            }
          }
        }
        console.log(
          '[spatula] match-capture result',
          entry.loader,
          entry.file,
          'patches:',
          patches.length,
          'validationErrors:',
          validationErrors,
        )
        results.push({
          matched: true,
          loader: entry.loader,
          file: entry.file,
          patches,
          validationErrors,
        })
      }
      return results
    })

    onMessage('get-loaders', () => {
      return buildLoaderInfos(allSites)
    })

    onMessage('write-loader', async ({ data }) => {
      if (import.meta.env.PROD) {
        return {
          ok: false,
          error: 'write-loader is only available in development',
        }
      }
      try {
        const response = await fetch(`http://localhost:3000/__spatula_write`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ path: data.path, content: data.content }),
        })
        if (!response.ok) {
          return { ok: false, error: `Server returned ${response.status}` }
        }
        return { ok: true }
      } catch (err) {
        return {
          ok: false,
          error: err instanceof Error ? err.message : String(err),
        }
      }
    })

    onMessage('generate-jsonata', async ({ data }) => {
      const capture = await getCaptureById(data.captureId)
      if (!capture) {
        return { ok: false, error: 'Capture not found' }
      }
      const geminiKey = await storage.get('gemini:api-key', '')
      const zaiKey = await storage.get('zai:api-key', '')
      if (!geminiKey && !zaiKey) {
        return {
          ok: false,
          error: 'No API key configured in settings (Gemini or z.ai)',
        }
      }
      const site = allSites.find((s) => capture.hostname.endsWith(s.hostname))
      const entities = site?.entities ?? instagramSite.entities
      const result = await runGenerationLoop(
        [capture],
        geminiKey ?? '',
        zaiKey ?? '',
        entities,
        data.currentExpression || undefined,
        data.userNote || undefined,
      )
      if (!result.success) {
        return { ok: false, error: result.error }
      }
      return {
        ok: true,
        expression: result.jsonataExpression,
        explanation: result.potentialEntities,
      }
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
      const site = allSites.find(
        (s) => captures[0] && captures[0].hostname.endsWith(s.hostname),
      )
      const entities = site?.entities ?? instagramSite.entities
      return runGenerationLoop(
        captures,
        geminiKey ?? '',
        zaiKey ?? '',
        entities,
      )
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
          scope: 'pool',
          text: 'Server enabled, starting...',
        })
        client!.start(client!.getServer())
      } else {
        log({
          severity: 'info',
          scope: 'pool',
          text: 'Server disabled, stopping...',
        })
        client!.stop(client!.getServer())
      }
    })

    validator = new EntityValidator(allSites)

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
