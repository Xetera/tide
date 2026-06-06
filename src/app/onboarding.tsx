/* @refresh reload */
import { render } from 'solid-js/web'
import { For, Match, Show, Switch, createMemo, createSignal } from 'solid-js'
import { useBrowserStorage } from '~/shared/hooks'
import type { HeartbeatStatus } from '~/server/client'
import { JoinPoolForm } from './join-pool'
import { SiteGrid } from './site-grid'
import './app.css'

type Step = 'consent' | 'path' | 'sites' | 'done'
type Path = 'pool' | 'standalone'

const STEPS: { id: Step; label: string }[] = [
  { id: 'consent', label: 'Welcome' },
  { id: 'path', label: 'Setup' },
  { id: 'sites', label: 'Sites' },
  { id: 'done', label: 'Done' },
]

function StepDots(props: { current: Step }) {
  const currentIndex = () => STEPS.findIndex((s) => s.id === props.current)
  return (
    <div class='flex items-center gap-2' style={{ 'margin-bottom': '24px' }}>
      <For each={STEPS}>
        {(step, i) => (
          <>
            <Show when={i() > 0}>
              <div
                style={{
                  height: '1px',
                  width: '24px',
                  background:
                    i() <= currentIndex()
                      ? 'var(--foreground)'
                      : 'var(--hairline)',
                }}
              />
            </Show>
            <span
              class={i() <= currentIndex() ? 't-label' : 't-muted'}
              style={{ 'font-size': '12px' }}
            >
              {step.label}
            </span>
          </>
        )}
      </For>
    </div>
  )
}

function ConsentStep(props: { onNext: () => void }) {
  return (
    <div class='flex flex-col gap-4'>
      <h1 class='t-display'>Welcome to Tide</h1>
      <p class='t-body'>
        Tide collects data from pages you visit and shares it with a pool you
        choose. Before you start, here is how it works.
      </p>
      <div
        class='panel'
        style={{ padding: '16px', border: '1px solid var(--hairline)' }}
      >
        <ul class='flex flex-col gap-3'>
          <li class='t-body-sm'>
            <strong>Read-only.</strong> Tide only reads what your browser has
            already rendered. It never interacts with a site, so running it does
            not risk your account.
          </li>
          <li class='t-body-sm'>
            <strong>No personal data.</strong> Specs never target personally
            identifiable information, and data about your own logged-in profile
            is excluded.
          </li>
          <li class='t-body-sm'>
            <strong>You opt in.</strong> Nothing is collected or shared until
            you enable a site below, and you can test what would be collected in
            the Playground first.
          </li>
        </ul>
      </div>
      <div class='flex justify-end'>
        <button type='button' class='btn btn-primary' onClick={props.onNext}>
          Continue
        </button>
      </div>
    </div>
  )
}

function PathStep(props: {
  onChoose: (path: Path) => void
  onBack: () => void
}) {
  return (
    <div class='flex flex-col gap-4'>
      <h1 class='t-display'>How do you want to use Tide?</h1>
      <p class='t-body'>You can change this later from the popup.</p>
      <div class='flex flex-col gap-3'>
        <button
          type='button'
          class='panel text-left'
          style={{
            padding: '16px',
            border: '1px solid var(--hairline)',
            cursor: 'pointer',
          }}
          onClick={() => props.onChoose('pool')}
        >
          <span class='set-name'>Join a pool</span>
          <p class='set-desc' style={{ 'margin-top': '4px' }}>
            Someone shared an invite link with you. Tide will collect the sites
            the pool requests and send results to their backend.
          </p>
        </button>
        <button
          type='button'
          class='panel text-left'
          style={{
            padding: '16px',
            border: '1px solid var(--hairline)',
            cursor: 'pointer',
          }}
          onClick={() => props.onChoose('standalone')}
        >
          <span class='set-name'>Run standalone</span>
          <p class='set-desc' style={{ 'margin-top': '4px' }}>
            Pick sites yourself and test data collection locally. No backend
            connection is required.
          </p>
        </button>
      </div>
      <div class='flex justify-start'>
        <button type='button' class='btn btn-secondary' onClick={props.onBack}>
          Back
        </button>
      </div>
    </div>
  )
}

function SitesStep(props: {
  path: Path
  onNext: () => void
  onBack: () => void
}) {
  const [joined, setJoined] = createSignal(false)
  const showSites = () => props.path === 'standalone' || joined()

  function onJoined(hb: HeartbeatStatus | null) {
    if (hb === null || hb.status === 'ok' || hb.status === 'unreachable') {
      setJoined(true)
    }
  }

  return (
    <div class='flex flex-col gap-4'>
      <h1 class='t-display'>
        {props.path === 'pool' ? 'Join your pool' : 'Choose your sites'}
      </h1>

      <Show when={props.path === 'pool' && !joined()}>
        <p class='t-body'>
          Paste the invite link the pool owner gave you. Once you join, the
          sites the pool requests will appear below.
        </p>
        <div
          class='panel'
          style={{ padding: '16px', border: '1px solid var(--hairline)' }}
        >
          <JoinPoolForm onJoined={onJoined} />
        </div>
      </Show>

      <Show when={showSites()}>
        <p class='t-body'>
          Enable the sites you want Tide to collect from. Each toggle grants
          Tide permission for that site; nothing is collected until you do.
        </p>
        <div class='panel' style={{ border: '1px solid var(--hairline)' }}>
          <div class='sec-head'>
            <span class='title'>Sites</span>
          </div>
          <SiteGrid source={props.path === 'pool' ? 'pool' : 'all'} />
        </div>
      </Show>

      <div class='flex justify-between'>
        <button type='button' class='btn btn-secondary' onClick={props.onBack}>
          Back
        </button>
        <button
          type='button'
          class='btn btn-primary'
          disabled={props.path === 'pool' && !joined()}
          onClick={props.onNext}
        >
          {props.path === 'pool' && !joined() ? 'Join to continue' : 'Continue'}
        </button>
      </div>
    </div>
  )
}

function DoneStep(props: { onFinish: () => void }) {
  return (
    <div class='flex flex-col gap-4'>
      <h1 class='t-display'>You're all set</h1>
      <p class='t-body'>
        Tide is now configured. Open the extension popup any time to see
        activity, manage sites, or join another pool.
      </p>
      <div class='flex justify-end'>
        <button type='button' class='btn btn-primary' onClick={props.onFinish}>
          Finish
        </button>
      </div>
    </div>
  )
}

function Onboarding() {
  const { set: setCompleted } = useBrowserStorage('onboarding:completed', false)
  const [step, setStep] = createSignal<Step>('consent')
  const [path, setPath] = createSignal<Path>('standalone')

  const stepClass = createMemo(() => step())

  async function finish() {
    await setCompleted(true)
    window.close()
  }

  return (
    <div
      class='bg-[var(--background)] text-[var(--foreground)]'
      style={{ 'min-height': '100vh' }}
    >
      <div
        style={{
          'max-width': '560px',
          margin: '0 auto',
          padding: '48px 24px',
        }}
      >
        <StepDots current={stepClass()} />
        <Switch>
          <Match when={step() === 'consent'}>
            <ConsentStep onNext={() => setStep('path')} />
          </Match>
          <Match when={step() === 'path'}>
            <PathStep
              onBack={() => setStep('consent')}
              onChoose={(p) => {
                setPath(p)
                setStep('sites')
              }}
            />
          </Match>
          <Match when={step() === 'sites'}>
            <SitesStep
              path={path()}
              onBack={() => setStep('path')}
              onNext={() => setStep('done')}
            />
          </Match>
          <Match when={step() === 'done'}>
            <DoneStep onFinish={finish} />
          </Match>
        </Switch>
      </div>
    </div>
  )
}

const root = document.querySelector('#root')!
render(() => <Onboarding />, root)
