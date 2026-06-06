import { Show, createMemo } from 'solid-js'
import {
  TextField,
  TextFieldDescription,
  TextFieldLabel,
  TextFieldRoot,
} from '~/components/ui/textfield'
import { useBrowserStorage } from '~/shared/hooks'
import type { HeartbeatStatus } from '~/server/client'
import { JoinPoolForm } from './join-pool'
import { SiteGrid } from './site-grid'

interface PoolProps {
  heartbeat?: HeartbeatStatus | null
}

function poolLabel(serverUrl: string, poolId: string): string {
  let host = serverUrl
  try {
    host = new URL(serverUrl).host
  } catch {
    host = serverUrl
  }
  const shortId = poolId.length > 8 ? `${poolId.slice(0, 8)}…` : poolId
  return host ? `${host} · ${shortId}` : shortId
}

export function Pool(props: PoolProps = {}) {
  const { value: serverUrl } = useBrowserStorage('server:url', '')
  const { value: poolId } = useBrowserStorage('server:pool-id', '')
  const { value: workerSecret } = useBrowserStorage('server:worker-secret', '')
  const { value: workerId } = useBrowserStorage('server:worker-id', '')

  const hasCredentials = createMemo(
    () => !!(serverUrl() && poolId() && workerSecret()),
  )

  const unauthorized = createMemo(
    () => props.heartbeat?.status === 'unauthorized',
  )

  return (
    <div class='flex flex-col'>
      <Show
        when={hasCredentials()}
        fallback={
          <div class='flex flex-col gap-3 px-4 py-3 border-b border-border'>
            <div class='flex flex-col gap-1'>
              <span class='title'>You're not in a pool yet</span>
              <span class='t-muted'>
                Paste an invite link from a pool owner to start collecting.
              </span>
            </div>
            <JoinPoolForm />
          </div>
        }
      >
        <div class='flex flex-col gap-3 px-4 py-3 border-b border-border'>
          <div class='flex items-start justify-between gap-3'>
            <div class='flex flex-col gap-1 min-w-0'>
              <span class='title'>
                {unauthorized() ? 'Removed from your pool' : 'In a pool'}
              </span>
              <span
                class='t-mono-xs truncate text-foreground-muted'
                title={`${serverUrl()} / ${poolId()}`}
              >
                {poolLabel(serverUrl() ?? '', poolId() ?? '')}
              </span>
            </div>
          </div>

          <Show when={unauthorized()}>
            <div class='t-mono-xs px-2.5 py-2 rounded-shoal-sm border border-destructive bg-danger-soft text-destructive'>
              The pool owner may have removed you. Paste a fresh invite below to
              rejoin, or join a different pool.
            </div>
          </Show>

          <details>
            <summary class='t-muted cursor-pointer select-none'>
              {unauthorized()
                ? 'Rejoin or switch pools'
                : 'Switch to a different pool'}
            </summary>
            <div class='flex flex-col gap-2 mt-2'>
              <span class='t-muted'>
                Joining another pool replaces your current one. Paste its invite
                link below.
              </span>
              <JoinPoolForm showDescription={false} />
            </div>
          </details>
        </div>
      </Show>

      <div>
        <div class='sec-head'>
          <span class='title'>Sites</span>
        </div>
        <SiteGrid
          source={hasCredentials() ? 'pool' : 'all'}
          emptyFallback={() => (
            <div class='flex flex-col items-center gap-3 px-3 py-6'>
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
          )}
        />
      </div>

      <div class='flex flex-col gap-3 px-4 py-3 border-t border-border'>
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
