import { Show, createMemo, createSignal } from 'solid-js'
import { sendMessage } from 'webext-bridge/popup'
import {
  TextField,
  TextFieldDescription,
  TextFieldLabel,
  TextFieldRoot,
} from '~/components/ui/textfield'
import { useBrowserStorage } from '~/shared/hooks'
import type {
  HeartbeatStatus,
  ErrorResponse,
  JoinRequest,
  JoinResponse,
} from '@tide/client'

export function parseInviteUrl(
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

export function heartbeatMessage(hb: HeartbeatStatus | null): {
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

interface JoinPoolFormProps {
  onJoined?: (heartbeat: HeartbeatStatus | null) => void
  showDescription?: boolean
}

export function JoinPoolForm(props: JoinPoolFormProps = {}) {
  const { set: setServerUrl } = useBrowserStorage('server:url', '')
  const { set: setPoolId } = useBrowserStorage('server:pool-id', '')
  const { set: setWorkerSecret } = useBrowserStorage('server:worker-secret', '')
  const { value: workerId } = useBrowserStorage('server:worker-id', '')

  const [inviteUrl, setInviteUrl] = createSignal('')
  const [joining, setJoining] = createSignal(false)
  const [joinError, setJoinError] = createSignal<string | null>(null)
  const [joinSuccess, setJoinSuccess] = createSignal(false)
  const [heartbeat, setHeartbeat] = createSignal<HeartbeatStatus | null>(null)
  const parsed = createMemo(() => parseInviteUrl(inviteUrl()))

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
      props.onJoined?.(hb)
    } catch (err) {
      setJoinError(err instanceof Error ? err.message : 'Failed to connect')
    } finally {
      setJoining(false)
    }
  }

  return (
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
          return <p class={`t-mono-xs mt-1 ${msg.toneClass}`}>{msg.text}</p>
        })()}
      </Show>
      <Show when={(props.showDescription ?? true) && !joinSuccess()}>
        <TextFieldDescription>
          Paste an invite link from the pool owner.
        </TextFieldDescription>
      </Show>
    </TextFieldRoot>
  )
}
