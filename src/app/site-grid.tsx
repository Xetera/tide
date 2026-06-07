import { For, Show, createSignal, onMount } from 'solid-js'
import type { JSX } from 'solid-js'
import { onMessage, sendMessage } from 'webext-bridge/popup'
import { useBrowserStorage } from '~/shared/hooks'
import type { SiteSpec } from '@tide/spec'
import { toOrigin } from '@tide/spec'

interface StatefulSite {
  hostAllowed: boolean
  site: SiteSpec
}

export function SiteToggleRow({
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

interface SiteGridProps {
  source: 'pool' | 'all'
  emptyFallback?: () => JSX.Element
}

export function SiteGrid(props: SiteGridProps) {
  const { value: optedIn } = useBrowserStorage('sites:opted-in', [])
  const [statefulSites, setStatefulSites] = createSignal<StatefulSite[]>([])

  async function buildStatefulSites(
    specs: SiteSpec[],
  ): Promise<StatefulSite[]> {
    const { origins = [] } = await chrome.permissions.getAll()
    return specs.map((site) => ({
      site,
      hostAllowed: origins.includes(toOrigin(site)),
    }))
  }

  async function loadSites() {
    const message = props.source === 'pool' ? 'pool-sites' : 'sites'
    const specs = await sendMessage(message, undefined, {
      context: 'background',
      tabId: 0,
    })
    setStatefulSites(await buildStatefulSites(specs))
  }

  onMount(loadSites)

  onMessage('update-sites', () => {
    void loadSites()
  })

  async function toggleSite(siteSpec: SiteSpec, enabled: boolean) {
    if (enabled) {
      await chrome.permissions.request({ origins: [toOrigin(siteSpec)] })
    } else {
      await chrome.permissions.remove({ origins: [toOrigin(siteSpec)] })
    }
    setStatefulSites(
      await buildStatefulSites(statefulSites().map((s) => s.site)),
    )
  }

  return (
    <Show
      when={statefulSites().length > 0}
      fallback={
        props.emptyFallback ? (
          props.emptyFallback()
        ) : (
          <div
            class='flex flex-col items-center gap-3'
            style={{ padding: '24px 12px' }}
          >
            <p class='t-muted text-center'>No sites configured</p>
          </div>
        )
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
  )
}
