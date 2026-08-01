import { Menu } from 'lucide-react'

interface TopbarProps {
  title: string
  onMenuClick: () => void
}

export function Topbar({ title, onMenuClick }: TopbarProps) {
  return (
    <header className="flex h-14 items-center gap-3 border-b border-line bg-canvas/80 px-4 backdrop-blur sm:px-6 lg:px-8">
      <button
        aria-label="Open navigation"
        className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted hover:bg-elevated hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent lg:hidden"
        onClick={onMenuClick}
        type="button"
      >
        <Menu aria-hidden="true" size={18} />
      </button>
      <h1 className="truncate text-sm font-semibold text-ink">{title}</h1>
    </header>
  )
}