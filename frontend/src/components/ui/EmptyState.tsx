import type { LucideIcon } from 'lucide-react'

import { cn } from '../../lib/utils'

interface EmptyStateProps {
  icon: LucideIcon
  title: string
  description: string
  className?: string
}

export function EmptyState({ icon: Icon, title, description, className }: EmptyStateProps) {
  return (
    <div
      className={cn(
        'rounded-md border border-dashed border-line bg-canvas px-5 py-8 text-center',
        className,
      )}
    >
      <span className="mx-auto flex h-9 w-9 items-center justify-center rounded-md border border-line bg-surface text-muted">
        <Icon aria-hidden="true" size={18} strokeWidth={1.7} />
      </span>
      <h3 className="mt-3 text-sm font-semibold text-ink">{title}</h3>
      <p className="mx-auto mt-1 max-w-md text-sm leading-6 text-ink-soft">{description}</p>
    </div>
  )
}
