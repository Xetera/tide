import { cn } from '~/cn'
import type { ComponentProps } from 'solid-js'

type PillTone = 'mute' | 'ok' | 'warn' | 'err'

type StatusPillProps = ComponentProps<'span'> & {
  tone?: PillTone
  class?: string
}

const toneClasses: Record<PillTone, { pill: string; dot: string }> = {
  mute: {
    pill: 'bg-[var(--surface-2)] text-[var(--foreground-muted)]',
    dot: 'bg-[var(--shoal-ink-400)]',
  },
  ok: {
    pill: 'bg-[var(--success-soft)] text-[var(--shoal-sage-500)]',
    dot: 'bg-[var(--shoal-sage-500)]',
  },
  warn: {
    pill: 'bg-[var(--warning-soft)] text-[var(--shoal-amber-500)]',
    dot: 'bg-[var(--shoal-amber-500)]',
  },
  err: {
    pill: 'bg-[var(--destructive-soft)] text-[var(--shoal-rose-500)]',
    dot: 'bg-[var(--shoal-rose-500)]',
  },
}

export function StatusPill(props: StatusPillProps) {
  const { tone = 'mute', class: className, children, ...rest } = props
  const classes = toneClasses[tone]

  return (
    <span
      class={cn(
        'inline-flex items-center gap-1.5 px-2.5 py-[3px] rounded-full',
        'text-[11px] font-medium leading-none whitespace-nowrap font-[var(--font-sans)]',
        classes.pill,
        className,
      )}
      {...rest}
    >
      <span class={cn('w-[7px] h-[7px] rounded-full shrink-0', classes.dot)} />
      {children}
    </span>
  )
}
