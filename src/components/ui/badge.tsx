import { cn } from '~/cn'
import { cva, type VariantProps } from 'class-variance-authority'
import type { ComponentProps } from 'solid-js'

const badgeVariants = cva(
  'inline-flex items-center rounded-md border px-1.5 py-0.5 text-xs font-medium transition-colors',
  {
    variants: {
      variant: {
        default: 'border-transparent bg-primary text-primary-foreground',
        secondary: 'border-transparent bg-secondary text-secondary-foreground',
        outline: 'border-border text-foreground',
        muted: 'border-transparent bg-muted text-muted-foreground',
      },
    },
    defaultVariants: {
      variant: 'secondary',
    },
  },
)

type BadgeProps = ComponentProps<'span'> &
  VariantProps<typeof badgeVariants> & {
    class?: string
  }

export function Badge(props: BadgeProps) {
  const { variant, class: className, ...rest } = props
  return (
    <span class={cn(badgeVariants({ variant }), className)} {...rest} />
  )
}
