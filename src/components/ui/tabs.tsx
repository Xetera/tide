import { createContext, useContext, type JSX } from 'solid-js'
import { cn } from '~/cn'

type TabsContextValue = {
  value: () => string
  onChange: (value: string) => void
}

const TabsContext = createContext<TabsContextValue>()

function useTabsContext() {
  const ctx = useContext(TabsContext)
  if (!ctx) {throw new Error('Tabs component must be used inside <Tabs>')}
  return ctx
}

type TabsProps = {
  value: string
  onChange: (value: string) => void
  children: JSX.Element
  class?: string
}

export function Tabs(props: TabsProps) {
  return (
    <TabsContext.Provider
      value={{ value: () => props.value, onChange: props.onChange }}
    >
      <div class={cn('w-full', props.class)}>{props.children}</div>
    </TabsContext.Provider>
  )
}

type TabsListProps = {
  children: JSX.Element
  class?: string
}

export function TabsList(props: TabsListProps) {
  return (
    <div role='tablist' class={cn('flex border-b', props.class)} style={{ 'border-color': 'var(--hairline)' }}>
      {props.children}
    </div>
  )
}

type TabsTriggerProps = {
  value: string
  children: JSX.Element
  class?: string
}

export function TabsTrigger(props: TabsTriggerProps) {
  const ctx = useTabsContext()
  const selected = () => ctx.value() === props.value
  return (
    <button
      role='tab'
      type='button'
      aria-selected={selected()}
      onClick={() => ctx.onChange(props.value)}
      class={cn('pool-tab', selected() && 'pool-tab-active', props.class)}
      data-selected={selected() ? '' : undefined}
    >
      {props.children}
    </button>
  )
}

type TabsContentProps = {
  value: string
  children: JSX.Element
  class?: string
}

export function TabsContent(props: TabsContentProps) {
  const ctx = useTabsContext()
  return (
    <div
      role='tabpanel'
      style={{ display: ctx.value() === props.value ? undefined : 'none' }}
      class={cn(props.class)}
    >
      {props.children}
    </div>
  )
}
