import { onMessage } from 'webext-bridge/background'
import { Client } from '~/server/client'
import { ServerAutonomy, type ResourceSpec } from '~/site-spec/types'
import { instagramSite } from '~/sites/instagram'
import { allSites } from '~/sites'
import { generateUID } from '~/shared/uid'
import { type BrowserStorageSchema, Storage } from '~/shared/storage'
import { log } from './backend-logger'
import { ContentScriptTracker } from './content-script-tracker'
import { addDisableChipsListener } from './cookie'
import {
  addIframeSecurityListener,
  disableIframeSecurity,
} from './iframe-security'
import { StorageListener } from './storage-listener'
import {
  getCaptureById,
  getCapturesForHostname,
  storeCaptureEntry,
} from './capture'
import { EntityValidator } from '~/extraction/entity-validator'
import { JsonataExpression } from '~/extraction/jsonata-bindings'
import type { CaptureEntry, FunnelMatchResult } from '~/generation/types'
import { runGenerationLoop } from '~/generation/llm'
import {
  funnelProvider,
  matchesGlob,
  captureMatchesKnownFunnel,
} from '~/site-spec/funnel-loader'

const storage = new Storage<BrowserStorageSchema>()

console.log(
  '[tide] funnelEntries:',
  funnelProvider.getEntries().map((e) => `${e.site}/${e.funnel}/${e.file}`),
)
console.log(
  '[tide] allSites requests:',
  allSites.map(
    (s) =>
      `${s.hostname}: ${s
        .getNetworkFunnels()
        .map((l) => l.name)
        .join(', ')}`,
  ),
)

function hostnameFromUrl(url: string): string {
  try {
    return new URL(url).hostname
  } catch {
    return url
  }
}

const BUILTIN_EXAMPLES = funnelProvider.buildBuiltinExamples()

let validator: EntityValidator | null = null

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
          name: serverName!,
          url: serverUrl!,
          autonomy: autonomy!,
          poolId: poolId!,
          workerId: workerId!,
          workerSecret: workerSecret!,
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
          resources.map((resource) => resource.entity),
        )
        storage.set('resources:all', resources)
        const hostnames = resources.map((re) => re.hostname)
        disableIframeSecurity(hostnames)
        for (const tabId of tabIds) {
          chrome.tabs
            .sendMessage(tabId, { type: 'update-resources', resources })
            .catch(() => {})
        }
        chrome.webNavigation.onHistoryStateUpdated.removeListener(emitUrlUpdate)
        chrome.webNavigation.onHistoryStateUpdated.addListener(emitUrlUpdate, {
          url: resources.map((resource) => ({
            hostContains: resource.hostname,
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
    onMessage('open-tab', ({ data }) => {
      chrome.tabs.create({ url: data.url })
    })
    onMessage('get-tabs-for-hostname', async ({ data }) => {
      const tabs = await chrome.tabs.query({})
      return tabs
        .filter((t) => {
          if (!t.url || t.id == null) {
            return false
          }
          try {
            return new URL(t.url).hostname === data.hostname
          } catch {
            return false
          }
        })
        .map((t) => ({
          tabId: t.id!,
          title: t.title ?? t.url ?? '',
          url: t.url!,
        }))
    })
    onMessage('get-tab-html', async ({ data }) => {
      try {
        const results = await chrome.scripting.executeScript({
          target: { tabId: data.tabId },
          func: () => ({
            html: document.documentElement.outerHTML,
            url: location.href,
          }),
        })
        const result = results[0]?.result
        if (!result) {
          return null
        }
        return result as { html: string; url: string }
      } catch {
        return null
      }
    })
    onMessage('toggle-resource', () => {})
    onMessage('log', ({ data }) => {
      log(data)
    })
    onMessage('raw-capture', async ({ data }) => {
      const hostname = hostnameFromUrl(data.url)
      console.log(
        '[tide] raw-capture received',
        data.method,
        data.url,
        `body=${data.responseBody.length}b`,
      )
      if (!captureMatchesKnownFunnel(allSites, data.url, data.method)) {
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
        console.log('[tide] raw-capture stored', data.url)
      } catch (err) {
        console.error('[tide] raw-capture store failed', data.url, err)
      }
    })
    onMessage('get-captures', async ({ data }) => {
      const captures = await getCapturesForHostname(data.hostname)
      if (!data.request) {
        return captures
      }
      const { method, url } = data.request
      const urls = Array.isArray(url) ? url : [url]
      return captures.filter(
        (c) =>
          c.method.toUpperCase() === method.toUpperCase() &&
          urls.some((u) => matchesGlob(u, new URL(c.url).pathname)),
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
      const results: FunnelMatchResult[] = []
      for (const entry of funnelProvider.getEntries()) {
        const expr = new JsonataExpression(entry.body, {
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
            funnel: entry.funnel,
            file: entry.file,
            error: err instanceof Error ? err.message : String(err),
          })
          continue
        }
        if (result === undefined) {
          results.push({
            matched: false,
            funnel: entry.funnel,
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
            funnel: entry.funnel,
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
          '[tide] match-capture result',
          entry.funnel,
          entry.file,
          'patches:',
          patches.length,
          'validationErrors:',
          validationErrors,
        )
        results.push({
          matched: true,
          funnel: entry.funnel,
          file: entry.file,
          patches,
          validationErrors,
        })
      }
      return results
    })

    onMessage('heartbeat', async () => {
      const ok = await client!.sendHeartbeat()
      return { ok }
    })

    onMessage('sites', () => {
      return allSites.map((s) => ({ site: s.id, hostname: s.hostname }))
    })

    onMessage('get-funnels', () => {
      return funnelProvider.buildFunnelInfos(allSites)
    })

    onMessage('write-funnel', async ({ data }) => {
      if (import.meta.env.PROD) {
        return {
          ok: false,
          error: 'write-funnel is only available in development',
        }
      }
      try {
        const response = await fetch(`http://localhost:3000/__tide_write`, {
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

    onMessage('create-funnel', async ({ data }) => {
      if (import.meta.env.PROD) {
        return {
          ok: false,
          error: 'create-funnel is only available in development',
        } as const
      }
      const ext = data.format === 'htmlegy' ? 'htmlegy' : 'jsonata'
      const path = `src/sites/${data.site}/loaders/${data.name}.${ext}`
      const content =
        data.format === 'htmlegy'
          ? `---\nurl: "/"\n---\n`
          : `---\nmethod: GET\nurl: "/"\n---\n`
      try {
        const response = await fetch(`http://localhost:3000/__tide_write`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ path, content }),
        })
        if (!response.ok) {
          return {
            ok: false,
            error: `Server returned ${response.status}`,
          } as const
        }
        return { ok: true, path } as const
      } catch (err) {
        return {
          ok: false,
          error: err instanceof Error ? err.message : String(err),
        } as const
      }
    })

    onMessage('generate-jsonata', async ({ data }) => {
      const capture = await getCaptureById(data.captureId)
      if (!capture) {
        return { ok: false, error: 'Capture not found' } as const
      }
      const geminiKey = await storage.get('gemini:api-key', '')
      const zaiKey = await storage.get('zai:api-key', '')
      if (!geminiKey && !zaiKey) {
        return {
          ok: false,
          error: 'No API key configured in settings (Gemini or z.ai)',
        } as const
      }
      const site = allSites.find((s) => capture.hostname.endsWith(s.hostname))
      const entities = site?.entities ?? instagramSite.entities
      const result = await runGenerationLoop({
        captures: [capture],
        geminiKey: geminiKey ?? '',
        zaiKey: zaiKey ?? '',
        entities,
        validator: validator!,
        examples: BUILTIN_EXAMPLES,
        initialExpression: data.currentExpression || undefined,
        userNote: data.userNote || undefined,
        onProgress: async ({ stage, attempt, validationErrors }) => {
          await storage.set('generation:progress', {
            stage: stage as never,
            attempt,
            validationErrors,
            timestamp: Date.now(),
          })
        },
        onAttempts: async (attempts) => {
          await storage.set('generation:attempts', attempts)
        },
      })
      if (!result.success) {
        return { ok: false, error: result.error } as const
      }
      await storage.set('generation:last-result', {
        result,
        timestamp: Date.now(),
      })
      return {
        ok: true,
        expression: result.jsonataExpression,
        explanation: result.potentialEntities,
      } as const
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
      return runGenerationLoop({
        captures,
        geminiKey: geminiKey ?? '',
        zaiKey: zaiKey ?? '',
        entities,
        validator: validator!,
        examples: BUILTIN_EXAMPLES,
        onProgress: async ({ stage, attempt, validationErrors }) => {
          await storage.set('generation:progress', {
            stage: stage as never,
            attempt,
            validationErrors,
            timestamp: Date.now(),
          })
        },
        onAttempts: async (attempts) => {
          await storage.set('generation:attempts', attempts)
        },
      })
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
    const resources: ResourceSpec[] = localSchema
      ? (() => {
          try {
            return JSON.parse(localSchema)
          } catch {
            return []
          }
        })()
      : []
    // client.setResources(client.getServer(), resources)
    // storage.set('resources:all', resources)

    await client.startAll()

    const HEARTBEAT_ALARM = 'tide:heartbeat'
    // chrome 117+ allows 30s alarms
    chrome.alarms.create(HEARTBEAT_ALARM, { periodInMinutes: 0.5 })
    chrome.alarms.onAlarm.addListener((alarm) => {
      if (alarm.name === HEARTBEAT_ALARM) {
        console.log("Heartbeating...")
        client!.sendHeartbeat()
      }
    })
    client.sendHeartbeat()
  } catch (err) {
    console.error(err)
  }
})()
