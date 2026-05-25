import { cn } from '~/cn'
import * as SwitchPrimitive from '@kobalte/core/switch'
import type { PolymorphicProps } from '@kobalte/core/polymorphic'
import { type ValidComponent, splitProps } from 'solid-js'

export const SwitchLabel = SwitchPrimitive.Label
export const Switch = SwitchPrimitive.Root
export const SwitchDescription = SwitchPrimitive.Description
export const SwitchErrorMessage = SwitchPrimitive.ErrorMessage

type SwitchControlProps = SwitchPrimitive.SwitchControlProps & {
  class?: string
}

export const SwitchControl = <T extends ValidComponent = 'button'>(
  props: PolymorphicProps<T, SwitchControlProps>,
) => {
  const [local, rest] = splitProps(props as SwitchControlProps, ['class'])

  return (
    <>
      <SwitchPrimitive.Input class='[&:focus-visible+button]:shadow-[var(--shadow-focus)] [&:focus-visible+button]:outline-none' />
      <SwitchPrimitive.Control
        class={cn('switch switch-child', local.class)}
        {...rest}
      >
        <SwitchPrimitive.Thumb class='pointer-events-none block h-4 w-4 rounded-full bg-[var(--surface)] shadow-[0_2px_4px_rgba(20,25,50,0.18)] ring-0 transition-transform data-[checked]:translate-x-4 translate-x-0' />
      </SwitchPrimitive.Control>
    </>
  )
}
