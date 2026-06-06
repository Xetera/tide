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

export function Pool(props: PoolProps = {}) {
  const { value: serverUrl } = useBrowserStorage('server:url', '')
  const { value: poolId } = useBrowserStorage('server:pool-id', '')
  const { value: workerSecret } = useBrowserStorage('server:worker-secret', '')
  const { value: workerId } = useBrowserStorage('server:worker-id', '')

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
            <JoinPoolForm />
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
            <Show when={props.heartbeat?.status === 'unauthorized'}>
              <div class='t-mono-xs px-2.5 py-2 rounded-shoal-sm border border-destructive bg-danger-soft text-destructive'>
                You are not authorized in this pool. The pool owner may have
                removed you from it. Paste a fresh invite below to rejoin.
              </div>
            </Show>
            <JoinPoolForm />
          </div>
        </details>
      </Show>

      <div>
        <div class='sec-head'>
          <span class='title'>Sites</span>
        </div>
        <SiteGrid
          source={hasCredentials() ? 'pool' : 'all'}
          emptyFallback={() => (
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
          )}
        />
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
