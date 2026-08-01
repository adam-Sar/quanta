import { useMemo, useState } from 'react'
import { ArrowUpDown, Eye, History } from 'lucide-react'

import type { DatasetVersionResponse, HistoryComparisonResponse } from '../../types/api'
import { formatNumber, formatTimestamp } from '../../lib/utils'
import { Badge } from '../ui/Badge'
import { Button } from '../ui/Button'
import { EmptyState } from '../ui/EmptyState'
import { Panel, SectionHeading } from '../ui/Panel'
import { cn } from '../../lib/utils'

type SortKey = 'created_at' | 'base' | 'target' | 'delta' | 'grade' | 'schema'

interface ComparisonsTableProps {
  runs: HistoryComparisonResponse[]
  versionsById: Record<string, DatasetVersionResponse>
  selectedComparisonId: string | null
  onSelectComparison: (comparisonId: string) => void
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
      <ArrowUpDown aria-hidden="true" className={active ? 'text-accent' : 'text-muted'} size={13} />
      {active ? <span className="sr-only">{direction === 'asc' ? 'ascending' : 'descending'}</span> : null}
    </button>
  )
}

function describeScoreDelta(delta: number | null): { tone: 'success' | 'warning' | 'danger' | 'muted'; label: string } {
  if (delta === null) return { tone: 'muted', label: 'No score' }
  if (delta > 0) return { tone: 'success', label: `+${delta.toFixed(1)}` }
  if (delta < 0) return { tone: 'danger', label: delta.toFixed(1) }
  return { tone: 'muted', label: '0.0' }
}

export function ComparisonsTable({
  runs,
  versionsById,
  selectedComparisonId,
  onSelectComparison,
  page,
  pageSize,
  totalItems,
  totalPages,
  onPageChange,
}: ComparisonsTableProps) {
  const [sortKey, setSortKey] = useState<SortKey>('created_at')
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc')

  const handleSort = (key: SortKey) => {
    if (key === sortKey) {
      setSortDirection((current) => (current === 'asc' ? 'desc' : 'asc'))
      return
    }
    setSortKey(key)
    setSortDirection('desc')
  }

  const sorted = useMemo(() => {
    return [...runs].sort((left, right) => {
      let comparison = 0
      if (sortKey === 'created_at') {
        comparison = left.created_at.localeCompare(right.created_at)
      } else if (sortKey === 'base') {
        const leftBase = versionsById[left.base_version_id]?.version_number ?? 0
        const rightBase = versionsById[right.base_version_id]?.version_number ?? 0
        comparison = leftBase - rightBase
      } else if (sortKey === 'target') {
        const leftTarget = versionsById[left.target_version_id]?.version_number ?? 0
        const rightTarget = versionsById[right.target_version_id]?.version_number ?? 0
        comparison = leftTarget - rightTarget
      } else if (sortKey === 'delta') {
        const leftDelta = left.score_drift.delta ?? 0
        const rightDelta = right.score_drift.delta ?? 0
        comparison = leftDelta - rightDelta
      } else if (sortKey === 'grade') {
        const leftGrade = left.score_drift.grade_changed ? 1 : 0
        const rightGrade = right.score_drift.grade_changed ? 1 : 0
        comparison = leftGrade - rightGrade
      } else if (sortKey === 'schema') {
        const leftChanges = left.schema_diff.added.length + left.schema_diff.removed.length + left.schema_diff.type_changes.length
        const rightChanges = right.schema_diff.added.length + right.schema_diff.removed.length + right.schema_diff.type_changes.length
        comparison = leftChanges - rightChanges
      }
      return sortDirection === 'asc' ? comparison : -comparison
    })
  }, [runs, sortKey, sortDirection, versionsById])

  if (runs.length === 0) {
    return (
      <Panel padded={false}>
        <div className="border-b border-line px-5 py-5">
          <SectionHeading
            description="Every comparison run is persisted as an immutable history_comparisons row bound to the chosen base and target versions."
            eyebrow="Comparisons"
            title="Comparison history"
            action={<Badge dot tone="muted">No runs</Badge>}
          />
        </div>
        <div className="p-5">
          <EmptyState
            className="py-8"
            description="No comparison runs are recorded for this dataset yet. Pick a base and target version above and run a comparison."
            icon={History}
            title="No comparisons"
          />
        </div>
      </Panel>
    )
  }

  return (
    <Panel padded={false}>
      <div className="border-b border-line px-5 py-5">
        <SectionHeading
          description="Every comparison run is persisted as an immutable history_comparisons row bound to the chosen base and target versions. Click a row to load its detail above."
          eyebrow="Comparisons"
          title="Comparison history"
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
            <tr className="border-b border-line bg-surface-2 text-[10px] uppercase tracking-[0.12em] text-muted">
              <th className="px-3 py-2">Comparison id</th>
              <th className="px-3 py-2"><SortButton active={sortKey === 'base'} direction={sortDirection} label="Base" onClick={() => handleSort('base')} /></th>
              <th className="px-3 py-2"><SortButton active={sortKey === 'target'} direction={sortDirection} label="Target" onClick={() => handleSort('target')} /></th>
              <th className="px-3 py-2"><SortButton active={sortKey === 'schema'} direction={sortDirection} label="Schema" onClick={() => handleSort('schema')} /></th>
              <th className="px-3 py-2"><SortButton active={sortKey === 'delta'} direction={sortDirection} label="Score delta" onClick={() => handleSort('delta')} /></th>
              <th className="px-3 py-2"><SortButton active={sortKey === 'grade'} direction={sortDirection} label="Grade" onClick={() => handleSort('grade')} /></th>
              <th className="px-3 py-2"><SortButton active={sortKey === 'created_at'} direction={sortDirection} label="Created" onClick={() => handleSort('created_at')} /></th>
              <th className="px-3 py-2"><span className="sr-only">Inspect</span></th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((row) => {
              const isSelected = row.comparison_id === selectedComparisonId
              const baseNumber = versionsById[row.base_version_id]?.version_number
              const targetNumber = versionsById[row.target_version_id]?.version_number
              const schemaChanges = row.schema_diff.added.length + row.schema_diff.removed.length + row.schema_diff.type_changes.length
              const deltaTone = describeScoreDelta(row.score_drift.delta)
              return (
                <tr
                  className={cn(
                    'cursor-pointer border-b border-line/40 last:border-b-0 hover:bg-canvas',
                    isSelected && 'bg-accent/5 hover:bg-accent/10',
                  )}
                  key={row.comparison_id}
                  onClick={() => onSelectComparison(row.comparison_id)}
                >
                  <td className="px-3 py-2 font-mono text-ink">
                    <p>{row.comparison_id.slice(0, 8)}</p>
                    <p className="mt-0.5 text-[10px] text-muted">{row.formula_version}</p>
                  </td>
                  <td className="px-3 py-2 font-mono text-muted">{baseNumber !== undefined ? `v${baseNumber}` : '—'}</td>
                  <td className="px-3 py-2 font-mono text-ink">{targetNumber !== undefined ? `v${targetNumber}` : '—'}</td>
                  <td className="px-3 py-2 font-mono text-muted">
                    {schemaChanges === 0 ? 'No change' : `${schemaChanges} change${schemaChanges === 1 ? '' : 's'}`}
                  </td>
                  <td className="px-3 py-2 font-mono text-ink">
                    <Badge dot tone={deltaTone.tone}>{deltaTone.label}</Badge>
                  </td>
                  <td className="px-3 py-2 font-mono text-muted">
                    {row.score_drift.grade_changed ? <Badge dot tone="warning">Changed</Badge> : 'Stable'}
                  </td>
                  <td className="px-3 py-2 font-mono text-muted">
                    <p>{formatTimestamp(row.created_at)}</p>
                  </td>
                  <td className="px-3 py-2">
                    <Button
                      aria-label={`Inspect comparison ${row.comparison_id}`}
                      onClick={(event) => {
                        event.stopPropagation()
                        onSelectComparison(row.comparison_id)
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
        <p>Page {page} of {Math.max(totalPages, 1)} · {formatNumber(totalItems)} total comparisons · page size {pageSize}</p>
        <div className="flex items-center gap-2">
          <Button disabled={page <= 1} onClick={() => onPageChange(page - 1)} size="sm" variant="secondary">Previous</Button>
          <Button disabled={page >= totalPages} onClick={() => onPageChange(page + 1)} size="sm" variant="secondary">Next</Button>
        </div>
      </div>
    </Panel>
  )
}
