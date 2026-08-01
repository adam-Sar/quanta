import type { LucideIcon } from 'lucide-react'
import { NavLink } from 'react-router-dom'

export interface NavigationItem {
  label: string
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
    <span
      aria-hidden="true"
      className="relative flex h-7 w-7 items-center justify-center rounded-md border border-line bg-elevated"
    >
      <span className="absolute h-3.5 w-1.5 -translate-x-1 rounded-sm bg-accent" />
      <span className="absolute h-5 w-1.5 translate-x-1 rounded-sm bg-accent/55" />
    </span>
  )
}

function StatusDot({ tone }: { tone: 'success' | 'warning' | 'muted' }) {
  const colorClass =
    tone === 'success' ? 'bg-success' : tone === 'warning' ? 'bg-warning' : 'bg-muted'
  return <span aria-hidden="true" className={`inline-block h-1.5 w-1.5 rounded-full ${colorClass}`} />
}

export function Sidebar({ items, isOpen, serviceState, onNavigate }: SidebarProps) {
  const serviceLabel =
    serviceState === 'ready' ? 'API ready' : serviceState === 'degraded' ? 'API unreachable' : 'Checking…'
  const serviceTone: 'success' | 'warning' | 'muted' =
    serviceState === 'ready' ? 'success' : serviceState === 'degraded' ? 'warning' : 'muted'

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
          'fixed inset-y-0 left-0 z-40 flex w-[240px] flex-col border-r border-line bg-surface transition-transform duration-200 lg:static lg:z-auto lg:translate-x-0',
          isOpen ? 'translate-x-0' : '-translate-x-full',
        )}
      >
        <div className="flex h-14 items-center gap-3 border-b border-line px-5">
          <QuantaMark />
          <p className="text-sm font-semibold tracking-[0.06em] text-ink">Quanta</p>
        </div>

        <nav aria-label="Primary navigation" className="flex-1 px-3 py-4">
          <ul className="space-y-1">
            {items.map(({ label, to, icon: Icon }) => (
              <li key={to}>
                <NavLink
                  className={({ isActive }) =>
                    cn(
                      'group flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors',
                      isActive
                        ? 'bg-accent/10 text-ink'
                        : 'text-muted hover:bg-elevated hover:text-ink',
                    )
                  }
                  end={to === '/'}
                  onClick={onNavigate}
                  to={to}
                >
                  {({ isActive }) => (
                    <>
                      <span
                        aria-hidden="true"
                        className={cn(
                          'h-1 w-1 shrink-0 rounded-full transition-colors',
                          isActive ? 'bg-accent' : 'bg-transparent',
                        )}
                      />
                      <Icon aria-hidden="true" className="shrink-0" size={16} strokeWidth={1.8} />
                      <span className="font-medium">{label}</span>
                    </>
                  )}
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>

        <div className="flex h-12 items-center gap-2 border-t border-line px-5">
          <StatusDot tone={serviceTone} />
          <span className="text-xs text-muted">{serviceLabel}</span>
        </div>
      </aside>
    </>
  )
}

function cn(...classes: Array<string | false | null | undefined>): string {
  return classes.filter(Boolean).join(' ')
}