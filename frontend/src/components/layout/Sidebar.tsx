import type { LucideIcon } from 'lucide-react'
import { NavLink } from 'react-router-dom'

import { cn } from '../../lib/utils'
import { Badge } from '../ui/Badge'

export interface NavigationItem {
  label: string
  description: string
  to: string
  icon: LucideIcon
}

interface SidebarProps {
  items: NavigationItem[]
  isOpen: boolean
  serviceState: 'checking' | 'ready' | 'degraded'
  onNavigate: () => void
}

function QuantaMark() {
  return (
    <span aria-hidden="true" className="relative flex h-8 w-8 items-center justify-center rounded-md border border-accent/30 bg-accent/10">
      <span className="absolute h-3.5 w-1.5 -translate-x-1.5 rounded-sm bg-accent" />
      <span className="absolute h-5 w-1.5 translate-x-1 rounded-sm bg-accent/60" />
    </span>
  )
}

export function Sidebar({ items, isOpen, serviceState, onNavigate }: SidebarProps) {
  const serviceLabel = {
    checking: 'Checking connection',
    ready: 'API ready',
    degraded: 'API needs attention',
  }[serviceState]
  const serviceTone = serviceState === 'ready' ? 'success' : serviceState === 'degraded' ? 'warning' : 'muted'

  return (
    <>
      {isOpen ? (
        <button
          aria-label="Close navigation"
          className="fixed inset-0 z-30 bg-black/50 lg:hidden"
          onClick={onNavigate}
          type="button"
        />
      ) : null}
      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-40 flex w-[248px] flex-col border-r border-line bg-surface transition-transform duration-200 lg:static lg:z-auto lg:translate-x-0',
          isOpen ? 'translate-x-0' : '-translate-x-full',
        )}
      >
        <div className="flex h-16 items-center gap-3 border-b border-line px-5">
          <QuantaMark />
          <div>
            <p className="text-sm font-semibold tracking-[0.08em] text-ink">QUANTA</p>
            <p className="mt-0.5 text-[10px] uppercase tracking-[0.16em] text-muted">Data reliability</p>
          </div>
        </div>

        <nav aria-label="Primary navigation" className="flex-1 px-3 py-5">
          <p className="px-3 pb-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-muted">Workspace</p>
          <div className="space-y-1">
            {items.map(({ label, description, to, icon: Icon }) => (
              <NavLink
                className={({ isActive }) =>
                  cn(
                    'group flex items-center gap-3 rounded-md border px-3 py-2.5 transition-colors',
                    isActive
                      ? 'border-accent/20 bg-accent/10 text-ink shadow-accent-inset'
                      : 'border-transparent text-muted hover:border-line hover:bg-elevated/70 hover:text-ink',
                  )
                }
                end={to === '/'}
                key={to}
                onClick={onNavigate}
                to={to}
              >
                <Icon aria-hidden="true" className="shrink-0" size={17} strokeWidth={1.8} />
                <span className="min-w-0">
                  <span className="block text-sm font-medium">{label}</span>
                  <span className="mt-0.5 block truncate text-[11px] text-muted group-hover:text-muted">{description}</span>
                </span>
              </NavLink>
            ))}
          </div>
        </nav>

        <div className="border-t border-line p-4">
          <div className="rounded-md border border-line bg-canvas/30 p-3">
            <div className="flex items-center justify-between gap-3">
              <span className="text-[10px] font-semibold uppercase tracking-[0.15em] text-muted">System status</span>
              <span aria-hidden="true" className={cn('h-1.5 w-1.5 rounded-full', serviceState === 'ready' ? 'bg-success' : serviceState === 'degraded' ? 'bg-warning' : 'bg-muted')} />
            </div>
            <Badge className="mt-3" dot tone={serviceTone}>{serviceLabel}</Badge>
            <p className="mt-2 text-[11px] leading-5 text-muted">Health checks refresh automatically while Quanta is open.</p>
          </div>
          <p className="mt-4 px-1 font-mono text-[10px] text-muted/70">CONTROL PLANE / 0.1</p>
        </div>
      </aside>
    </>
  )
}
