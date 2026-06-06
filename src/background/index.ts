import { onMessage } from 'webext-bridge/background'
import { Client } from '~/server/client'
import { ServerAutonomy } from '~/funnels/types'
import { instagramSite } from '~/sites/instagram'
import { allSites } from '~/sites'
import { generateUID } from '~/shared/uid'
import { type BrowserStorageSchema, Storage } from '~/shared/storage'
import { log } from './backend-logger'
import { ContentScriptTracker } from './content-script-tracker'
import {
  addIframeSecurityListener,
  allowCrossOriginForEntityPage,
  disableIframeSecurity,
} from './iframe-security'
import {
  syncContentScripts,
  getGrantedHostnames,
} from './content-script-registry'
import {
  addOptedInSite,
  removeOptedInSite,
} from '~/shared/site-optin'
import { toOrigin } from '~/funnels/url'
import type { SiteSpec } from '~/funnels/types'
import { StorageListener } from './storage-listener'
import {
  getCaptureById,
  getCapturesForHostname,
  storeCaptureEntry,
} from './capture'
import { EntityValidator } from '~/funnels/entity-validator'
import { JsonataExpression } from '@tide/jsonata'
import type { CaptureEntry, FunnelMatchResult } from '~/generation/types'
import { runGenerationLoop, runHtmlegyGenerationLoop } from '~/generation/llm'
import { buildFunnelInfos } from '~/generation/funnel-info'
import { funnelProvider } from '~/funnels/funnel-loader'
import { getRecording, isRecordingFor, setRecording } from '~/shared/recording'

const storage = new Storage<BrowserStorageSchema>()

chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason !== 'install') {
    return
  }
  chrome.tabs.create({ url: chrome.runtime.getURL('views/onboarding.html') })
})

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

const HEARTBEAT_ALARM = 'tide:heartbeat'
let clientReady: Promise<Client>
let resolveClient!: (client: Client) => void
let rejectClient!: (err: unknown) => void
clientReady = new Promise<Client>((resolve, reject) => {
  resolveClient = resolve
  rejectClient = reject
})

let lastHeartbeatStatus: string | null = null
async function runHeartbeat(trigger: 'startup' | 'alarm') {
  log({
    severity: 'debug',
    scope: 'pool',
    text: 'Heartbeat: tick',
    data: { trigger },
  })
  console.log('waiting for client')
  const c = await clientReady
  console.log('waiting for heartbeat')
  const result = await c.sendHeartbeat()
  console.log(result)
  await storage.set('heartbeat:last', { status: result, at: Date.now() })
  console.log('wrote heartbeat')
  const statusChanged = result.status !== lastHeartbeatStatus
  lastHeartbeatStatus = result.status
  if (result.status === 'unauthorized' && statusChanged) {
    log({
      severity: 'error',
      scope: 'pool',
      text: 'Heartbeat rejected by server. The worker may have been removed from the pool, or its secret no longer matches.',
      data: { httpStatus: result.httpStatus },
    })
  } else if (result.status === 'unreachable' && statusChanged) {
    log({
      severity: 'warning',
      scope: 'pool',
      text: 'Heartbeat failed: backend unreachable',
      data: { error: result.error },
    })
  } else if (result.status === 'error' && statusChanged) {
    log({
      severity: 'warning',
      scope: 'pool',
      text: 'Heartbeat returned an unexpected status',
      data: { httpStatus: result.httpStatus },
    })
  } else if (result.status === 'ok' && statusChanged) {
    log({
      severity: 'info',
      scope: 'pool',
      text: 'Heartbeat ok',
    })
  }
}

async function applyOptedInSites(optedIn: string[]) {
  const grantedHostnames = await getGrantedHostnames()
  const validHostnames = grantedHostnames.filter((h) =>
    allSites.some((s) => s.hostname === h && optedIn.includes(s.id)),
  )
  await syncContentScripts(validHostnames)
  chrome.webNavigation.onHistoryStateUpdated.removeListener(emitUrlUpdate)
  if (validHostnames.length > 0) {
    chrome.webNavigation.onHistoryStateUpdated.addListener(emitUrlUpdate, {
      url: validHostnames.map((h) => ({ hostContains: h })),
    })
  }
}

chrome.permissions.onAdded.addListener(async (permissions) => {
  const origins = permissions.origins ?? []
  for (const origin of origins) {
    const site = allSites.find((s) => toOrigin(s) === origin)
    if (!site) {
      continue
    }
    const siteSpec: SiteSpec = { site: site.id, hostname: site.hostname }
    const optedIn = await addOptedInSite(siteSpec)
    const c = await clientReady.catch(() => null)
    if (c) {
      await c.syncSites(optedIn)
    }
    await applyOptedInSites(optedIn)
  }
})

chrome.permissions.onRemoved.addListener(async (permissions) => {
  const origins = permissions.origins ?? []
  for (const origin of origins) {
    const site = allSites.find((s) => toOrigin(s) === origin)
    if (!site) {
      continue
    }
    const siteSpec: SiteSpec = { site: site.id, hostname: site.hostname }
    const optedIn = await removeOptedInSite(siteSpec)
    const c = await clientReady.catch(() => null)
    if (c) {
      await c.syncSites(optedIn)
    }
    await applyOptedInSites(optedIn)
  }
})

chrome.runtime.onMessageExternal.addListener((message, _sender, sendResponse) => {
  if (message?.type === 'tide:version') {
    sendResponse({ version: chrome.runtime.getManifest().version })
  }
})

chrome.runtime.onMessage.addListener((message) => {
  if (message?.type === 'open-popup') {
    const hostname: string | undefined = message.hostname
    const open = () => chrome.action.openPopup().catch(() => {})
    if (hostname) {
      chrome.storage.session
        .set({ 'optin:pending-hostname': hostname })
        .then(open)
    } else {
      open()
    }
  }
})

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === HEARTBEAT_ALARM) {
    runHeartbeat('alarm')
  }
})
chrome.alarms.get(HEARTBEAT_ALARM, (existing) => {
  if (!existing) {
    chrome.alarms.create(HEARTBEAT_ALARM, { periodInMinutes: 0.5 })
    log({
      severity: 'debug',
      scope: 'pool',
      text: 'Heartbeat alarm registered',
      data: { periodInMinutes: 0.5 },
    })
  }
})

log({
  severity: 'debug',
  scope: 'pool',
  text: 'background: script evaluated',
})

;(async () => {
  let client: Client | undefined

  try {
    log({
      severity: 'debug',
      scope: 'pool',
      text: 'background: init IIFE entered',
    })
    try {
      await chrome.storage.session.setAccessLevel({
        accessLevel: 'TRUSTED_AND_UNTRUSTED_CONTEXTS',
      })
    } catch (err) {
      console.warn('[tide] failed to widen session storage access', err)
    }
    const cst = new ContentScriptTracker()

    const startupHostnames = await getGrantedHostnames()
    await syncContentScripts(startupHostnames)
    if (startupHostnames.length > 0) {
      chrome.webNavigation.onHistoryStateUpdated.addListener(emitUrlUpdate, {
        url: startupHostnames.map((h) => ({ hostContains: h })),
      })
    }

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
      onPatches(emission) {
        storage.set('scrape:last', emission)
      },
    })

    resolveClient(client)

    if (startupHostnames.length > 0) {
      disableIframeSecurity(startupHostnames)
    }
    addIframeSecurityListener(
      async () => {
        const hostnames = await getGrantedHostnames()
        await syncContentScripts(hostnames)
        chrome.webNavigation.onHistoryStateUpdated.removeListener(emitUrlUpdate)
        if (hostnames.length > 0) {
          chrome.webNavigation.onHistoryStateUpdated.addListener(
            emitUrlUpdate,
            {
              url: hostnames.map((h) => ({ hostContains: h })),
            },
          )
        }
      },
      async () => {
        const hostnames = await getGrantedHostnames()
        await syncContentScripts(hostnames)
        chrome.webNavigation.onHistoryStateUpdated.removeListener(emitUrlUpdate)
        if (hostnames.length > 0) {
          chrome.webNavigation.onHistoryStateUpdated.addListener(
            emitUrlUpdate,
            {
              url: hostnames.map((h) => ({ hostContains: h })),
            },
          )
        }
      },
    )
    allowCrossOriginForEntityPage()
    // addDisableChipsListener(origins)

    onMessage('set-schema', ({ data }) => {
      storage.set('schema:local', JSON.stringify(data))
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
      const recording = await getRecording()
      if (!isRecordingFor(recording, hostname)) {
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
      return getCapturesForHostname(data.hostname)
    })
    onMessage('get-recording', async () => {
      return await getRecording()
    })
    onMessage('set-recording', async ({ data }) => {
      await setRecording({ hostname: data.hostname, enabled: data.enabled })
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
      const result = await client!.sendHeartbeat()
      await storage.set('heartbeat:last', { status: result, at: Date.now() })
      return result
    })

    onMessage('sites', () => {
      return allSites.map((s) => ({ site: s.id, hostname: s.hostname }))
    })

    onMessage('pool-sites', async () => {
      const optedIn = await storage.get('sites:opted-in', [])
      const result = await client!.syncSites(optedIn)
      if (!result) {
        return []
      }
      return allSites
        .filter((s) => result.sites.includes(s.id))
        .map((s) => ({ site: s.id, hostname: s.hostname }))
    })


    onMessage('get-funnels', () => {
      return buildFunnelInfos(funnelProvider)
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
      const path = `src/sites/${data.site}/funnels/${data.name}.${ext}`
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

    onMessage('generate-htmlegy', async ({ data }) => {
      console.log('[tide] generate-htmlegy handler reached')
      const geminiKey = await storage.get('gemini:api-key', '')
      const zaiKey = await storage.get('zai:api-key', '')
      if (!geminiKey && !zaiKey) {
        return {
          ok: false,
          error: 'No API key configured in settings (Gemini or z.ai)',
        } as const
      }
      const result = await runHtmlegyGenerationLoop({
        html: data.html,
        entity: data.entity,
        geminiKey: geminiKey ?? '',
        zaiKey: zaiKey ?? '',
        initialExpression: data.currentExpression || undefined,
        userNote: data.userNote,
        onProgress: async ({ stage, attempt }) => {
          await storage.set('generation:progress', {
            stage: stage as never,
            attempt,
            timestamp: Date.now(),
          })
        },
      })
      if (!result.success) {
        return { ok: false, error: result.error } as const
      }
      return { ok: true, expression: result.expression } as const
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

    await client.startAll()
  } catch (err) {
    rejectClient(err)
    console.error(err)
  }
})()

runHeartbeat('startup')
