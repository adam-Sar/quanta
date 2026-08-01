import type { HTMLAttributes } from 'react'

import { cn } from '../../lib/utils'

type BadgeTone = 'accent' | 'success' | 'warning' | 'danger' | 'muted' | 'info'

interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: BadgeTone
  dot?: boolean
}

const toneClasses: Record<BadgeTone, string> = {
  // Metabase-style badges: tinted background, dark text, no border.
  accent: 'bg-accent-tint text-accent',
  success: 'bg-emerald-50 text-emerald-700',
  warning: 'bg-amber-50 text-amber-700',
  danger: 'bg-rose-50 text-rose-700',
  muted: 'bg-canvas text-muted',
  info: 'bg-sky-50 text-sky-700',
}

export function Badge({ className, tone = 'muted', dot = false, children, ...props }: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded px-2 py-0.5 text-[11px] font-medium',
        toneClasses[tone],
        className,
      )}
      {...props}
    >
      {dot ? (
        <span
          aria-hidden="true"
          className={cn(
            'h-1.5 w-1.5 rounded-full bg-current',
          )}
        />
      ) : null}
      {children}
    </span>
  )
}
