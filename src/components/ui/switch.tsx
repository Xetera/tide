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
      <SwitchPrimitive.Input class='[&:focus-visible+div]:(outline-none ring-1.5 ring-ring ring-offset-2 ring-offset-background)' />
      <SwitchPrimitive.Control
        class={cn(
          'inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors data-[checked]:bg-primary bg-input data-[disabled]:(cursor-not-allowed opacity-50)',
          local.class,
        )}
        {...rest}
      >
        <SwitchPrimitive.Thumb class='pointer-events-none block h-4 w-4 translate-x-0 rounded-full bg-background shadow-lg ring-0 transition-transform data-[checked]:translate-x-4' />
      </SwitchPrimitive.Control>
    </>
  )
}
