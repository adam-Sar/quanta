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
  // 4x3 dot grid in sky blue, matching the Metabase brand mark
  return (
    <span
      aria-hidden="true"
      className="grid h-8 w-8 shrink-0 grid-cols-4 grid-rows-3 gap-[2px] place-items-center"
    >
      {Array.from({ length: 12 }, (_, i) => (
        <span
          key={i}
          className="h-1 w-1 rounded-full bg-[rgb(var(--color-accent))]"
        />
      ))}
    </span>
  )
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
          className="fixed inset-0 z-30 bg-slate-900/30 lg:hidden"
          onClick={onNavigate}
          type="button"
        />
      ) : null}
      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-40 flex w-[232px] flex-col border-r border-line bg-surface transition-transform duration-200 lg:static lg:z-auto lg:translate-x-0',
          isOpen ? 'translate-x-0' : '-translate-x-full',
        )}
      >
        <div className="flex h-14 items-center gap-2.5 border-b border-line px-5">
          <QuantaMark />
          <p className="text-[15px] font-semibold tracking-tight text-ink">Quanta</p>
        </div>

        <nav aria-label="Primary navigation" className="flex-1 px-3 py-4">
          <ul className="space-y-0.5">
            {items.map(({ label, to, icon: Icon }) => (
              <li key={to}>
                <NavLink to={to} end={to === ''} onClick={onNavigate}>
                  {({ isActive }) => (
                    <span
                      className={cn(
                        'group flex items-center gap-2.5 rounded-md px-3 py-2 text-sm transition-colors',
                        isActive
                          ? 'bg-accent-tint text-accent font-medium'
                          : 'text-ink-soft hover:bg-canvas hover:text-ink',
                      )}
                    >
                      <Icon
                        aria-hidden="true"
                        className="shrink-0"
                        size={16}
                        strokeWidth={isActive ? 2 : 1.6}
                      />
                      <span>{label}</span>
                    </span>
                  )}
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>

        <div className="flex h-12 items-center gap-2 border-t border-line px-5 text-xs text-muted">
          <span
            aria-hidden="true"
            className={cn(
              'h-1.5 w-1.5 rounded-full',
              serviceTone === 'success' && 'bg-success',
              serviceTone === 'warning' && 'bg-warning',
              serviceTone === 'muted' && 'bg-muted',
            )}
          />
          <span>{serviceLabel}</span>
        </div>
      </aside>
    </>
  )
}

function cn(...classes: Array<string | false | null | undefined>): string {
  return classes.filter(Boolean).join(' ')
}
