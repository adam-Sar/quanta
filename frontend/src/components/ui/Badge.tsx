import type { HTMLAttributes } from 'react'

import { cn } from '../../lib/utils'

type BadgeTone = 'accent' | 'success' | 'warning' | 'danger' | 'muted' | 'info'

interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: BadgeTone
  dot?: boolean
}

const toneClasses: Record<BadgeTone, string> = {
  accent: 'border-accent/25 bg-accent/10 text-accent',
  success: 'border-success/25 bg-success/10 text-success',
  warning: 'border-warning/25 bg-warning/10 text-warning',
  danger: 'border-danger/25 bg-danger/10 text-danger',
  muted: 'border-line bg-elevated text-muted',
  info: 'border-info/25 bg-info/10 text-info',
}

export function Badge({ className, tone = 'muted', dot = false, children, ...props }: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded border px-2 py-1 text-[11px] font-semibold tracking-wide',
        toneClasses[tone],
        className,
      )}
      {...props}
    >
      {dot ? <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-current" /> : null}
      {children}
    </span>
  )
}
