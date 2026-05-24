import { For, Show, createEffect, createMemo, createResource, createSignal, onMount } from 'solid-js'
import { onMessage, sendMessage } from 'webext-bridge/popup'
import {
  TextField,
  TextFieldDescription,
  TextFieldLabel,
  TextFieldRoot,
} from '~/components/ui/textfield'
import { useBrowserStorage } from '~/shared/hooks'
import type { SiteSpec } from '~/site-spec/types'
import { toOrigin } from '~/site-spec/resource'
import { Storage, type BrowserStorageSchema } from '~/shared/storage'

const storage = new Storage<BrowserStorageSchema>()

interface StatefulSite {
  hostAllowed: boolean
  site: SiteSpec
}

async function requestNewPermissions(site: SiteSpec) {
  await chrome.permissions.request({
    origins: [toOrigin(site)],
    permissions: ['declarativeNetRequest', 'webNavigation'],
  })
}

function SiteRow({
  site,
  hostAllowed,
  onClick,
}: {
  site: SiteSpec
  hostAllowed: boolean
  onClick: () => void
}) {
  return (
    <button
      type='button'
      onClick={onClick}
      class='s-set-row w-full text-left'
      style={{ cursor: 'pointer', border: '0', background: 'transparent' }}
    >
      <div class='s-set-meta'>
        <span class='s-set-name'>{site.site}</span>
        <span class='s-set-desc'>{site.hostname}</span>
      </div>
      <span
        class={`s-status-dot ${hostAllowed ? 's-status-live' : 's-status-mute'}`}
      />
    </button>
  )
}

function parseInviteUrl(
  raw: string,
): { serverUrl: string; poolId: string; token: string } | null {
  try {
    const url = new URL(raw)
    const match = url.pathname.match(/^\/api\/pool\/([^/]+)\/join$/)
    if (!match) {return null}
    const poolId = match[1]!
    const token = url.searchParams.get('token')
    if (!token) {return null}
    const serverUrl = url.origin
    return { serverUrl, poolId, token }
  } catch {
    return null
  }
}

function SiteToggleRow({
  site,
  enabled,
  onToggle,
}: {
  site: SiteSpec
  enabled: boolean
  onToggle: (enabled: boolean) => void
}) {
  return (
    <div class='s-set-row'>
      <div class='s-set-meta'>
        <span class='s-set-name'>{site.site}</span>
        <span class='s-set-desc'>{site.hostname}</span>
      </div>
      <button
        type='button'
        role='switch'
        aria-checked={enabled}
        onClick={() => onToggle(!enabled)}
        class='s-switch'
      />
    </div>
  )
}

export function Pool() {
  const { value: serverUrl, set: setServerUrl } = useBrowserStorage(
    'server:url',
    '',
  )
  const { value: poolId, set: setPoolId } = useBrowserStorage(
    'server:pool-id',
    '',
  )
  const { value: workerSecret, set: setWorkerSecret } = useBrowserStorage(
    'server:worker-secret',
    '',
  )
  const { value: workerId } = useBrowserStorage('server:worker-id', '')

  const [inviteUrl, setInviteUrl] = createSignal('')
  const [joining, setJoining] = createSignal(false)
  const [joinError, setJoinError] = createSignal<string | null>(null)
  const parsed = createMemo(() => parseInviteUrl(inviteUrl()))

  const [sites, setSites] = createSignal<SiteSpec[]>([])
  const [statefulSites, setStatefulSites] = createSignal<StatefulSite[]>([])
  const [optedOut, setOptedOut] = createSignal<string[]>([])

  async function updateStatefulSites(specs: SiteSpec[]) {
    const stateful = await Promise.all(
      specs.map(async (site) => {
        const hostAllowed = await chrome.permissions.contains({
          origins: [toOrigin(site)],
        })
        return { site, hostAllowed }
      }),
    )
    setStatefulSites(stateful)
  }

  onMount(async () => {
    const stored = await storage.get('sites:all', [])
    const specs = stored ?? []
    setSites(specs)
    updateStatefulSites(specs)
    const out = await storage.get('sites:opted-out', [])
    setOptedOut(out ?? [])
  })

  createEffect(async () => {
    const specs = await sendMessage('sites', undefined, {
      context: 'background',
      tabId: 0,
    })
    setSites(specs)
    updateStatefulSites(specs)
  })

  onMessage('update-sites', ({ data }) => {
    setSites(data)
    updateStatefulSites(data)
  })

  async function toggleSite(site: string, enabled: boolean) {
    const updated = enabled
      ? optedOut().filter((s) => s !== site)
      : [...new Set([...optedOut(), site])]
    setOptedOut(updated)
    await sendMessage('toggle-site', { site, enabled }, { context: 'background', tabId: 0 })
  }

  async function join() {
    const result = parsed()
    if (!result) {return}
    setJoining(true)
    setJoinError(null)
    try {
      const res = await fetch(
        `${result.serverUrl}/api/pool/${result.poolId}/join`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            invite_token: result.token,
            worker_id: workerId(),
          }),
        },
      )
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        setJoinError((body as any).error ?? `Server returned ${res.status}`)
        return
      }
      const body = (await res.json()) as { worker_secret: string }
      await setServerUrl(result.serverUrl)
      await setPoolId(result.poolId)
      await setWorkerSecret(body.worker_secret)
      setInviteUrl('')
    } catch (err) {
      setJoinError(err instanceof Error ? err.message : 'Failed to connect')
    } finally {
      setJoining(false)
    }
  }

  const hasCredentials = createMemo(
    () => !!(serverUrl() && poolId() && workerSecret()),
  )

  const [reachable] = createResource(
    () => (hasCredentials() ? true : null),
    async () => {
      try {
        const result = await sendMessage('heartbeat', null, { context: 'background', tabId: 0 }) as { ok: boolean } | null
        return result?.ok ?? false
      } catch {
        return false
      }
    },
  )

  const statusTone = () => {
    if (!hasCredentials() || reachable.loading) return 's-pill-mute'
    return reachable() ? 's-pill-ok' : 's-pill-warn'
  }

  const statusLabel = () => {
    if (!hasCredentials()) return 'Not connected'
    if (reachable.loading) return 'Checking...'
    return reachable() ? 'Connected' : 'Unreachable'
  }

  return (
    <div class='flex flex-col'>
      <div class='s-set-row'>
        <span class='s-set-name'>Status</span>
        <span class={`s-pill ${statusTone()}`}>
          <span class='s-dot' />
          {statusLabel()}
        </span>
      </div>

      <div class='flex flex-col gap-3' style={{ padding: '12px 16px', 'border-bottom': '1px solid var(--hairline)' }}>
        <TextFieldRoot>
          <TextFieldLabel>Invite URL</TextFieldLabel>
          <div class='flex gap-2'>
            <TextField
              type='url'
              placeholder='https://shoal.example.com/api/pool/.../join?token=...'
              value={inviteUrl()}
              onInput={(e) => setInviteUrl(e.currentTarget.value)}
              class='flex-1'
            />
            <button
              type='button'
              disabled={!parsed() || joining()}
              onClick={join}
              class='s-btn s-btn-primary s-btn-sm'
            >
              {joining() ? 'Joining...' : 'Join'}
            </button>
          </div>
          {joinError() && (
            <p class='t-mono-xs' style={{ color: 'var(--destructive)', 'margin-top': '4px' }}>{joinError()}</p>
          )}
          <TextFieldDescription>
            Paste an invite link from the pool owner.
          </TextFieldDescription>
        </TextFieldRoot>

        <TextFieldRoot>
          <TextFieldLabel>Worker secret</TextFieldLabel>
          <TextField
            type='password'
            placeholder='Issued after joining a pool'
            value={workerSecret() ?? ''}
            readOnly
          />
          <TextFieldDescription>
            Automatically set when the join flow is completed.
          </TextFieldDescription>
        </TextFieldRoot>

        <TextFieldRoot>
          <TextFieldLabel>Worker ID</TextFieldLabel>
          <TextField
            value={workerId() ?? 'Not yet generated'}
            readOnly
            class='s-input-mono'
          />
          <TextFieldDescription>
            Share this with the pool owner when requesting a worker secret.
          </TextFieldDescription>
        </TextFieldRoot>
      </div>

      <div>
        <div class='s-sec-head'>
          <span class='s-title'>Sites</span>
        </div>
        <Show
          when={statefulSites().length > 0}
          fallback={
            <div class='flex flex-col items-center gap-3' style={{ padding: '24px 12px' }}>
              <p class='t-muted text-center'>No sites configured</p>
              <button
                type='button'
                onClick={() => chrome.tabs.create({ url: chrome.runtime.getURL('playground.html') })}
                class='s-btn s-btn-secondary s-btn-sm'
              >
                Open Playground
              </button>
            </div>
          }
        >
          <Show
            when={hasCredentials()}
            fallback={
              <For each={statefulSites()}>
                {({ site, hostAllowed }) => (
                  <SiteRow
                    site={site}
                    hostAllowed={hostAllowed}
                    onClick={() => requestNewPermissions(site)}
                  />
                )}
              </For>
            }
          >
            <For each={sites()}>
              {(site) => (
                <SiteToggleRow
                  site={site}
                  enabled={!optedOut().includes(site.site)}
                  onToggle={(enabled) => toggleSite(site.site, enabled)}
                />
              )}
            </For>
          </Show>
        </Show>
      </div>
    </div>
  )
}
