import { cn } from '~/cn'
import type { ComponentProps } from 'solid-js'

type BadgeVariant = 'default' | 'secondary' | 'outline' | 'muted' | 'brand' | 'ok' | 'warn' | 'err'

type BadgeProps = ComponentProps<'span'> & {
  variant?: BadgeVariant
  class?: string
}

const variantClass: Record<BadgeVariant, string> = {
  default:   's-badge',
  secondary: 's-badge s-badge-muted',
  outline:   's-badge s-badge-outline',
  muted:     's-badge s-badge-muted',
  brand:     's-badge s-badge-brand',
  ok:        's-badge s-badge-ok',
  warn:      's-badge s-badge-warn',
  err:       's-badge s-badge-err',
}

export function Badge(props: BadgeProps) {
  const { variant = 'secondary', class: className, ...rest } = props
  return <span class={cn(variantClass[variant], className)} {...rest} />
}
