import { createMemo, createResource, createSignal } from 'solid-js'
import { sendMessage } from 'webext-bridge/popup'
import {
  TextField,
  TextFieldDescription,
  TextFieldLabel,
  TextFieldRoot,
} from '~/components/ui/textfield'
import { useBrowserStorage } from '~/shared/hooks'

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

  const statusLabel = () => {
    if (!hasCredentials()) return 'Not connected'
    if (reachable.loading) return 'Checking...'
    return reachable() ? 'Connected' : 'Unreachable'
  }

  const statusClass = () => {
    if (!hasCredentials() || !reachable()) return 'bg-muted text-muted-foreground'
    if (reachable.loading) return 'bg-muted text-muted-foreground'
    return 'bg-green-500/15 text-green-600 dark:text-green-400'
  }

  return (
    <div class='p-4 flex flex-col gap-4'>
      <div class='flex items-center justify-between'>
        <span class='text-sm font-medium'>Status</span>
        <span class={`text-xs px-2 py-0.5 rounded-full font-medium ${statusClass()}`}>
          {statusLabel()}
        </span>
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
            class='px-3 py-1 text-sm rounded-md border border-input hover:bg-accent transition-colors disabled:(opacity-50 cursor-not-allowed)'
          >
            {joining() ? 'Joining...' : 'Join'}
          </button>
        </div>
        {joinError() && (
          <p class='text-xs text-destructive mt-1'>{joinError()}</p>
        )}
        <TextFieldDescription>
          Paste an invite link from the pool owner. The link includes the
          server, pool, and a one-time token.
        </TextFieldDescription>
      </TextFieldRoot>

      <TextFieldRoot>
        <TextFieldLabel>Worker secret</TextFieldLabel>
        <TextField
          type='password'
          placeholder='Issued after joining a pool'
          value={workerSecret() ?? ''}
          readOnly
          class='text-muted-foreground'
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
          class='font-mono text-xs text-muted-foreground'
        />
        <TextFieldDescription>
          Share this with the pool owner when requesting a worker secret.
        </TextFieldDescription>
      </TextFieldRoot>
    </div>
  )
}
