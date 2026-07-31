import { ChevronLeft, ChevronRight } from 'lucide-react'

import { Button } from '../ui/Button'

interface PaginationControlsProps {
  page: number
  totalPages: number
  totalItems: number
  pageSize: number
  onPageChange: (page: number) => void
}

export function PaginationControls({ page, totalPages, totalItems, pageSize, onPageChange }: PaginationControlsProps) {
  if (!totalItems) return null
  const firstItem = (page - 1) * pageSize + 1
  const lastItem = Math.min(page * pageSize, totalItems)

  return (
    <div className="flex flex-col gap-3 border-t border-line px-5 py-3.5 sm:flex-row sm:items-center sm:justify-between">
      <p className="text-xs text-muted">Showing <span className="font-medium text-ink">{firstItem}–{lastItem}</span> of <span className="font-medium text-ink">{totalItems}</span> datasets</p>
      <div className="flex items-center gap-2">
        <Button aria-label="Previous page" disabled={page <= 1} onClick={() => onPageChange(page - 1)} size="sm" variant="ghost"><ChevronLeft aria-hidden="true" size={15} />Previous</Button>
        <span className="px-2 font-mono text-[11px] text-muted">{page} / {Math.max(totalPages, 1)}</span>
        <Button aria-label="Next page" disabled={page >= totalPages} onClick={() => onPageChange(page + 1)} size="sm" variant="ghost">Next<ChevronRight aria-hidden="true" size={15} /></Button>
      </div>
    </div>
  )
}
