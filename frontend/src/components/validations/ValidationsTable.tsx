import { useMemo, useState } from 'react'
import { ArrowUpDown, Eye, ShieldCheck } from 'lucide-react'

import type { ValidationResponse, ValidationStatus } from '../../types/api'
import { formatNumber, formatTimestamp } from '../../lib/utils'
import { Badge } from '../ui/Badge'
import { Button } from '../ui/Button'
import { EmptyState } from '../ui/EmptyState'
import { Panel, SectionHeading } from '../ui/Panel'
import { cn } from '../../lib/utils'

type SortKey = 'created_at' | 'status' | 'operation' | 'rows'

interface ValidationsTableProps {
  runs: ValidationResponse[]
  selectedValidationId: string | null
  onSelectValidation: (validationId: string) => void
  page: number
  pageSize: number
  totalItems: number
  totalPages: number
  onPageChange: (next: number) => void
}

function SortButton({ active, direction, label, onClick }: { active: boolean; direction: 'asc' | 'desc'; label: string; onClick: () => void }) {
  return (
    <button className="inline-flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-muted hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent" onClick={onClick} type="button">
      {label}
      <ArrowUpDown aria-hidden="true" className={active ? 'text-accent' : 'text-muted/60'} size={13} />
      {active ? <span className="sr-only">{direction === 'asc' ? 'ascending' : 'descending'}</span> : null}
    </button>
  )
}

const STATUS_TONE: Record<ValidationStatus, 'success' | 'warning' | 'danger'> = {
  valid: 'success',
  warning: 'warning',
  invalid: 'danger',
}

const STATUS_LABEL: Record<ValidationStatus, string> = {
  valid: 'Valid',
  warning: 'Warning',
  invalid: 'Invalid',
}

export function ValidationsTable({
  runs,
  selectedValidationId,
  onSelectValidation,
  page,
  pageSize,
  totalItems,
  totalPages,
  onPageChange,
}: ValidationsTableProps) {
  const [sortKey, setSortKey] = useState<SortKey>('created_at')
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc')

  const handleSort = (key: SortKey) => {
    if (key === sortKey) {
      setSortDirection((current) => (current === 'asc' ? 'desc' : 'asc'))
      return
    }
    setSortKey(key)
    setSortDirection(key === 'rows' || key === 'operation' ? 'desc' : 'desc')
  }

  const sorted = useMemo(() => {
    return [...runs].sort((left, right) => {
      let comparison = 0
      if (sortKey === 'created_at') {
        comparison = left.created_at.localeCompare(right.created_at)
      } else if (sortKey === 'status') {
        const order = { invalid: 2, warning: 1, valid: 0 } as Record<ValidationStatus, number>
        comparison = order[left.status] - order[right.status]
      } else if (sortKey === 'operation') {
        comparison = left.operation_kind.localeCompare(right.operation_kind)
      } else if (sortKey === 'rows') {
        comparison = (left.impact.affected_rows ?? 0) - (right.impact.affected_rows ?? 0)
      }
      return sortDirection === 'asc' ? comparison : -comparison
    })
  }, [runs, sortKey, sortDirection])

  if (runs.length === 0) {
    return (
      <Panel padded={false}>
        <div className="border-b border-line px-5 py-5">
          <SectionHeading
            description="Every validation run is persisted as an immutable validations row bound to the matching Task 8 recommendation. Run the preview engine above to compute the first batch."
            eyebrow="Validations"
            title="Validation history"
            action={<Badge dot tone="muted">No runs</Badge>}
          />
        </div>
        <div className="p-5">
          <EmptyState
            className="py-8"
            description="The deterministic preview engine has not been run for this recommendation yet. Trigger a validation above to compute the first batch."
            icon={ShieldCheck}
            title="No validations"
          />
        </div>
      </Panel>
    )
  }

  return (
    <Panel padded={false}>
      <div className="border-b border-line px-5 py-5">
        <SectionHeading
          description="Every validation run is persisted as an immutable validations row bound to the matching Task 8 recommendation. Click a row to load its detail above."
          eyebrow="Validations"
          title="Validation history"
          action={
            <div className="flex flex-wrap items-center justify-end gap-1">
              <Badge dot tone="muted">{formatNumber(totalItems)} total</Badge>
            </div>
          }
        />
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-[920px] w-full text-left text-xs">
          <thead>
            <tr className="border-b border-line bg-canvas/30 text-[10px] uppercase tracking-[0.12em] text-muted">
              <th className="px-3 py-2">Validation id</th>
              <th className="px-3 py-2"><SortButton active={sortKey === 'status'} direction={sortDirection} label="Status" onClick={() => handleSort('status')} /></th>
              <th className="px-3 py-2"><SortButton active={sortKey === 'operation'} direction={sortDirection} label="Operation" onClick={() => handleSort('operation')} /></th>
              <th className="px-3 py-2 text-right"><SortButton active={sortKey === 'rows'} direction={sortDirection} label="Affected rows" onClick={() => handleSort('rows')} /></th>
              <th className="px-3 py-2">Side effects</th>
              <th className="px-3 py-2"><SortButton active={sortKey === 'created_at'} direction={sortDirection} label="Created" onClick={() => handleSort('created_at')} /></th>
              <th className="px-3 py-2"><span className="sr-only">Inspect</span></th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((row) => {
              const isSelected = row.validation_id === selectedValidationId
              return (
                <tr
                  className={cn(
                    'cursor-pointer border-b border-line/70 last:border-b-0 hover:bg-elevated/40',
                    isSelected && 'bg-accent/5 hover:bg-accent/10',
                  )}
                  key={row.validation_id}
                  onClick={() => onSelectValidation(row.validation_id)}
                >
                  <td className="px-3 py-2 font-mono text-ink">
                    <p>{row.validation_id.slice(0, 8)}</p>
                    <p className="mt-0.5 text-[10px] text-muted/70">{row.formula_version}</p>
                  </td>
                  <td className="px-3 py-2">
                    <Badge dot tone={STATUS_TONE[row.status]}>{STATUS_LABEL[row.status]}</Badge>
                  </td>
                  <td className="px-3 py-2 font-mono text-ink">{row.operation_kind}</td>
                  <td className="px-3 py-2 text-right font-mono text-ink">{formatNumber(row.impact.affected_rows)}</td>
                  <td className="px-3 py-2 font-mono text-muted">{formatNumber(row.impact.unexpected_side_effects.length)}</td>
                  <td className="px-3 py-2 font-mono text-muted">
                    <p>{formatTimestamp(row.created_at)}</p>
                  </td>
                  <td className="px-3 py-2">
                    <Button
                      aria-label={`Inspect validation ${row.validation_id}`}
                      onClick={(event) => {
                        event.stopPropagation()
                        onSelectValidation(row.validation_id)
                      }}
                      size="sm"
                      variant={isSelected ? 'primary' : 'secondary'}
                    >
                      <Eye aria-hidden="true" size={12} />
                      {isSelected ? 'Selected' : 'Inspect'}
                    </Button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <div className="flex flex-col items-start gap-2 border-t border-line px-5 py-3.5 text-xs text-muted sm:flex-row sm:items-center sm:justify-between">
        <p>Page {page} of {Math.max(totalPages, 1)} · {formatNumber(totalItems)} total validations · page size {pageSize}</p>
        <div className="flex items-center gap-2">
          <Button disabled={page <= 1} onClick={() => onPageChange(page - 1)} size="sm" variant="secondary">Previous</Button>
          <Button disabled={page >= totalPages} onClick={() => onPageChange(page + 1)} size="sm" variant="secondary">Next</Button>
        </div>
      </div>
    </Panel>
  )
}
