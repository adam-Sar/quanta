import { Menu, Radio } from 'lucide-react'

import { cn } from '../../lib/utils'
import { Badge } from '../ui/Badge'

interface TopbarProps {
  title: string
  serviceState: 'checking' | 'ready' | 'degraded'
  onMenuClick: () => void
}

export function Topbar({ title, serviceState, onMenuClick }: TopbarProps) {
  const serviceLabel = serviceState === 'ready' ? 'Operational' : serviceState === 'degraded' ? 'Degraded' : 'Checking'
  const tone = serviceState === 'ready' ? 'success' : serviceState === 'degraded' ? 'warning' : 'muted'

  return (
    <header className="flex h-16 items-center justify-between border-b border-line bg-canvas/80 px-4 backdrop-blur sm:px-6 lg:px-8">
      <div className="flex min-w-0 items-center gap-3">
        <button
          aria-label="Open navigation"
          className="inline-flex h-9 w-9 items-center justify-center rounded-md text-muted hover:bg-elevated hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent lg:hidden"
          onClick={onMenuClick}
          type="button"
        >
          <Menu aria-hidden="true" size={19} />
        </button>
        <div className="min-w-0">
          <p className="hidden text-[10px] font-medium uppercase tracking-[0.16em] text-muted sm:block">Workspace / control plane</p>
          <h2 className="truncate text-sm font-semibold text-ink sm:mt-0.5">{title}</h2>
        </div>
      </div>
      <Badge className="shrink-0" dot tone={tone}>
        <Radio aria-hidden="true" size={12} />
        <span className={cn('hidden sm:inline')}>API {serviceLabel}</span>
        <span className="sm:hidden">{serviceLabel}</span>
      </Badge>
    </header>
  )
}
