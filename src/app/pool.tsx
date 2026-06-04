import { For, Show, createMemo, createSignal, onMount } from 'solid-js'
import { onMessage, sendMessage } from 'webext-bridge/popup'
import {
  TextField,
  TextFieldDescription,
  TextFieldLabel,
  TextFieldRoot,
} from '~/components/ui/textfield'
import { useBrowserStorage } from '~/shared/hooks'
import type { SiteSpec } from '~/funnels/types'
import { toOrigin } from '~/funnels/url'
import type { HeartbeatStatus } from '~/server/client'
import type { ErrorResponse, JoinRequest, JoinResponse } from '~/server/api'

function heartbeatMessage(hb: HeartbeatStatus | null): {
  text: string
  toneClass: string
} {
  if (hb === null) {
    return {
      text: 'Joined. Checking connection...',
      toneClass: 'text-foreground-muted',
    }
  }
  switch (hb.status) {
    case 'ok':
      return {
        text: 'Joined pool successfully.',
        toneClass: 'text-success',
      }
    case 'unauthorized':
      return {
        text: 'The server rejected our credentials. You may have been removed from the pool.',
        toneClass: 'text-destructive',
      }
    case 'unreachable':
      return {
        text: 'Joined, but the backend is unreachable.',
        toneClass: 'text-warning',
      }
    case 'unconfigured':
      return {
        text: 'Joined, but server credentials are missing.',
        toneClass: 'text-destructive',
      }
    case 'error':
      return {
        text: `Joined, but server responded with status ${hb.httpStatus}.`,
        toneClass: 'text-destructive',
      }
  }
}

interface StatefulSite {
  hostAllowed: boolean
  site: SiteSpec
}

function parseInviteUrl(
  raw: string,
): { serverUrl: string; poolId: string; token: string } | null {
  try {
    const url = new URL(raw)
    const match = url.pathname.match(/^\/api\/pool\/([^/]+)\/join$/)
    if (!match) {
      return null
    }
    const poolId = match[1]!
    const token = url.searchParams.get('token')
    if (!token) {
      return null
    }
    const serverUrl = url.origin
    return { serverUrl, poolId, token }
  } catch {
    return null
  }
}

function SiteToggleRow({
  site,
  enabled,
  hostAllowed,
  onToggle,
}: {
  site: SiteSpec
  enabled: () => boolean
  hostAllowed: () => boolean
  onToggle: (enabled: boolean) => void
}) {
  return (
    <div class='set-row'>
      <div class='flex items-center gap-2'>
        <img
          src={`https://icons.duckduckgo.com/ip3/${site.hostname}.ico`}
          width='16'
          height='16'
          style={{ 'border-radius': '3px', 'flex-shrink': '0' }}
          alt=''
        />
        <div class='set-meta'>
          <span class='set-name'>{site.site}</span>
          <span class='set-desc'>{site.hostname}</span>
        </div>
      </div>
      <div class='flex items-center gap-2'>
        <Show when={!hostAllowed()}>
          <span class='t-mono-xs t-muted'>needs permission</span>
        </Show>
        <button
          type='button'
          role='switch'
          aria-checked={enabled()}
          onClick={() => onToggle(!enabled())}
          class='switch'
        />
      </div>
    </div>
  )
}

interface PoolProps {
  heartbeat?: HeartbeatStatus | null
}

export function Pool(props: PoolProps = {}) {
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
  const [joinSuccess, setJoinSuccess] = createSignal(false)
  const [heartbeat, setHeartbeat] = createSignal<HeartbeatStatus | null>(null)
  const parsed = createMemo(() => parseInviteUrl(inviteUrl()))

  const { value: optedIn } = useBrowserStorage('sites:opted-in', [])
  const [statefulSites, setStatefulSites] = createSignal<StatefulSite[]>([])

  async function buildStatefulSites(specs: SiteSpec[]): Promise<StatefulSite[]> {
    const { origins = [] } = await chrome.permissions.getAll()
    return specs.map((site) => ({
      site,
      hostAllowed: origins.includes(toOrigin(site)),
    }))
  }

  onMount(async () => {
    const [poolSpecs, allSpecs] = await Promise.all([
      sendMessage('pool-sites', undefined, { context: 'background', tabId: 0 }),
      sendMessage('sites', undefined, { context: 'background', tabId: 0 }),
    ])

    const trackedIds = new Set(poolSpecs.map((s) => s.site))
    const displaySpecs = allSpecs.filter((s) => trackedIds.has(s.site))
    const stateful = await buildStatefulSites(displaySpecs.length > 0 ? displaySpecs : allSpecs)
    setStatefulSites(stateful)
  })

  onMessage('update-sites', async ({ data }) => {
    setStatefulSites(await buildStatefulSites(data))
  })

  async function toggleSite(siteSpec: SiteSpec, enabled: boolean) {
    if (enabled) {
      await chrome.permissions.request({ origins: [toOrigin(siteSpec)] })
    } else {
      await chrome.permissions.remove({ origins: [toOrigin(siteSpec)] })
    }
  }

  async function join() {
    const result = parsed()
    if (!result) {
      return
    }
    const wid = workerId()
    if (!wid) {
      setJoinError('Worker ID is not yet generated. Reopen the popup.')
      return
    }
    setJoining(true)
    setJoinError(null)
    try {
      const requestBody: JoinRequest = {
        invite_token: result.token,
        worker_id: wid,
      }
      const res = await fetch(
        `${result.serverUrl}/api/pool/${result.poolId}/join`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(requestBody),
        },
      )
      if (!res.ok) {
        const body = (await res
          .json()
          .catch(() => ({}))) as Partial<ErrorResponse>
        setJoinError(body.error ?? `Server returned ${res.status}`)
        return
      }
      const body = (await res.json()) as JoinResponse
      await setServerUrl(result.serverUrl)
      await setPoolId(result.poolId)
      await setWorkerSecret(body.worker_secret)
      setInviteUrl('')
      setJoinSuccess(true)
      const hb = await sendMessage('heartbeat', undefined, {
        context: 'background',
        tabId: 0,
      })
      setHeartbeat(hb)
    } catch (err) {
      setJoinError(err instanceof Error ? err.message : 'Failed to connect')
    } finally {
      setJoining(false)
    }
  }

  const hasCredentials = createMemo(
    () => !!(serverUrl() && poolId() && workerSecret()),
  )

  return (
    <div class='flex flex-col'>
      <Show
        when={hasCredentials()}
        fallback={
          <div
            class='flex flex-col gap-3'
            style={{
              padding: '12px 16px',
              'border-bottom': '1px solid var(--hairline)',
            }}
          >
            <div
              class='sec-head'
              style={{ padding: '0', 'border-bottom': 'none' }}
            >
              <span class='title'>Invites</span>
            </div>
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
                  class='btn btn-primary btn-sm'
                >
                  {joining() ? 'Joining...' : 'Join'}
                </button>
              </div>
              <Show when={joinError()}>
                <p
                  class='t-mono-xs'
                  style={{ color: 'var(--destructive)', 'margin-top': '4px' }}
                >
                  {joinError()}
                </p>
              </Show>
              <Show when={joinSuccess()}>
                {(() => {
                  const msg = heartbeatMessage(heartbeat())
                  return (
                    <p class={`t-mono-xs mt-1 ${msg.toneClass}`}>{msg.text}</p>
                  )
                })()}
              </Show>
              <TextFieldDescription>
                Paste an invite link from the pool owner.
              </TextFieldDescription>
            </TextFieldRoot>
          </div>
        }
      >
        <details
          style={{ 'border-bottom': '1px solid var(--hairline)' }}
          open={props.heartbeat?.status === 'unauthorized'}
        >
          <summary
            style={{
              padding: '10px 16px',
              cursor: 'pointer',
              'list-style': 'none',
              display: 'flex',
              'align-items': 'center',
              'justify-content': 'space-between',
            }}
          >
            <span class='t-muted' style={{ 'font-size': '13px' }}>
              Invites
            </span>
          </summary>
          <div class='flex flex-col gap-3' style={{ padding: '0 16px 12px' }}>
            <Show
              when={
                props.heartbeat?.status === 'unauthorized' && !joinSuccess()
              }
            >
              <div class='t-mono-xs px-2.5 py-2 rounded-shoal-sm border border-destructive bg-danger-soft text-destructive'>
                You are not authorized in this pool. The pool owner may have
                removed you from it. Paste a fresh invite below to rejoin.
              </div>
            </Show>
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
                  class='btn btn-primary btn-sm'
                >
                  {joining() ? 'Joining...' : 'Join'}
                </button>
              </div>
              <Show when={joinError()}>
                <p
                  class='t-mono-xs'
                  style={{ color: 'var(--destructive)', 'margin-top': '4px' }}
                >
                  {joinError()}
                </p>
              </Show>
              <Show when={joinSuccess()}>
                {(() => {
                  const msg = heartbeatMessage(heartbeat())
                  return (
                    <p class={`t-mono-xs mt-1 ${msg.toneClass}`}>{msg.text}</p>
                  )
                })()}
              </Show>
              <Show when={!joinSuccess()}>
                <TextFieldDescription>
                  Paste an invite link from the pool owner.
                </TextFieldDescription>
              </Show>
            </TextFieldRoot>
          </div>
        </details>
      </Show>

      <div>
        <div class='sec-head'>
          <span class='title'>Sites</span>
        </div>
        <Show
          when={statefulSites().length > 0}
          fallback={
            <div
              class='flex flex-col items-center gap-3'
              style={{ padding: '24px 12px' }}
            >
              <p class='t-muted text-center'>No sites configured</p>
              <button
                type='button'
                onClick={() =>
                  chrome.tabs.create({
                    url: chrome.runtime.getURL('views/playground.html'),
                  })
                }
                class='btn btn-secondary btn-sm'
              >
                Open Playground
              </button>
            </div>
          }
        >
          <For each={statefulSites()}>
            {(item) => (
              <SiteToggleRow
                site={item.site}
                hostAllowed={() =>
                  statefulSites().find((s) => s.site.site === item.site.site)
                    ?.hostAllowed ?? false
                }
                enabled={() => optedIn().includes(item.site.site)}
                onToggle={(enabled) => toggleSite(item.site, enabled)}
              />
            )}
          </For>
        </Show>
      </div>

      <div
        class='flex flex-col gap-3'
        style={{
          padding: '12px 16px',
          'border-top': '1px solid var(--hairline)',
        }}
      >
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
            class='input-mono'
          />
        </TextFieldRoot>
      </div>
    </div>
  )
}
