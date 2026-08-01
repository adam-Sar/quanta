import { useState } from 'react'
import { ArrowUpDown, Clock, Eye, History } from 'lucide-react'

import type { DatasetProfileResponse, DatasetVersionResponse } from '../../types/api'
import { formatNumber, formatTimestamp } from '../../lib/utils'
import { Badge } from '../ui/Badge'
import { Button } from '../ui/Button'
import { EmptyState } from '../ui/EmptyState'
import { cn } from '../../lib/utils'

type SortKey = 'started_at' | 'duration_ms' | 'sample_size' | 'columns'

interface ProfileRunsTableProps {
  runs: DatasetProfileResponse[]
  currentVersion: DatasetVersionResponse | null
  selectedProfileId: string | null
  onSelectProfile: (profileId: string) => void
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

function describeVersion(versionId: string, currentVersion: DatasetVersionResponse | null) {
  if (currentVersion && currentVersion.id === versionId) {
    return { label: `v${currentVersion.version_number}`, tone: 'success' as const, isCurrent: true }
  }
  return { label: versionId.slice(0, 8), tone: 'muted' as const, isCurrent: false }
}

export function ProfileRunsTable({
  runs,
  currentVersion,
  selectedProfileId,
  onSelectProfile,
  page,
  pageSize,
  totalItems,
  totalPages,
  onPageChange,
}: ProfileRunsTableProps) {
  const [sortKey, setSortKey] = useState<SortKey>('started_at')
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc')

  const sortLabels: Record<SortKey, string> = {
    started_at: 'Started',
    duration_ms: 'Duration',
    sample_size: 'Sample size',
    columns: 'Columns',
  }

  const handleSort = (key: SortKey) => {
    if (key === sortKey) {
      setSortDirection((current) => (current === 'asc' ? 'desc' : 'asc'))
      return
    }
    setSortKey(key)
    setSortDirection('desc')
  }

  const sorted = [...runs].sort((left, right) => {
    let comparison = 0
    if (sortKey === 'started_at') comparison = left.started_at.localeCompare(right.started_at)
    if (sortKey === 'duration_ms') comparison = left.duration_ms - right.duration_ms
    if (sortKey === 'sample_size') comparison = left.sample_size - right.sample_size
    if (sortKey === 'columns') comparison = left.columns.length - right.columns.length
    return sortDirection === 'asc' ? comparison : -comparison
  })

  if (runs.length === 0) {
    return (
      <EmptyState
        className="py-8"
        description="The backend will record a run here as soon as profiling is triggered."
        icon={History}
        title="No profile runs yet"
      />
    )
  }

  return (
    <div className="space-y-3">
      <div className="overflow-x-auto rounded-md border border-line">
        <table className="min-w-[720px] w-full text-left text-xs">
          <thead>
            <tr className="border-b border-line bg-canvas/30 text-[10px] uppercase tracking-[0.12em] text-muted">
              <th className="px-3 py-2">Profile id</th>
              <th className="px-3 py-2">Version</th>
              <th className="px-3 py-2 text-right"><SortButton active={sortKey === 'sample_size'} direction={sortDirection} label={sortLabels.sample_size} onClick={() => handleSort('sample_size')} /></th>
              <th className="px-3 py-2">Sample</th>
              <th className="px-3 py-2 text-right"><SortButton active={sortKey === 'columns'} direction={sortDirection} label={sortLabels.columns} onClick={() => handleSort('columns')} /></th>
              <th className="px-3 py-2 text-right"><SortButton active={sortKey === 'duration_ms'} direction={sortDirection} label={sortLabels.duration_ms} onClick={() => handleSort('duration_ms')} /></th>
              <th className="px-3 py-2"><SortButton active={sortKey === 'started_at'} direction={sortDirection} label={sortLabels.started_at} onClick={() => handleSort('started_at')} /></th>
              <th className="px-3 py-2"><span className="sr-only">Inspect</span></th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((run) => {
              const isSelected = run.profile_id === selectedProfileId
              const versionInfo = describeVersion(run.dataset_version_id, currentVersion)
              return (
                <tr
                  className={cn(
                    'cursor-pointer border-b border-line/70 last:border-b-0 hover:bg-elevated/40',
                    isSelected && 'bg-accent/5 hover:bg-accent/10',
                  )}
                  key={run.profile_id}
                  onClick={() => onSelectProfile(run.profile_id)}
                >
                  <td className="px-3 py-2 font-mono text-ink">
                    <p>{run.profile_id.slice(0, 8)}</p>
                    <p className="mt-0.5 text-[10px] text-muted">...{run.profile_id.slice(-4)}</p>
                  </td>
                  <td className="px-3 py-2 font-mono text-muted">
                    <p>{versionInfo.label}</p>
                    {versionInfo.isCurrent ? <p className="mt-0.5 text-[10px] text-success">current</p> : <p className="mt-0.5 text-[10px] text-muted/70">version id</p>}
                  </td>
                  <td className="px-3 py-2 text-right font-mono text-ink">{formatNumber(run.sample_size)}</td>
                  <td className="px-3 py-2">
                    <Badge dot tone={run.sampled === 'full' ? 'success' : 'info'}>
                      {run.sampled === 'full' ? 'Full sample' : 'Bounded sample'}
                    </Badge>
                  </td>
                  <td className="px-3 py-2 text-right font-mono text-ink">{formatNumber(run.columns.length)}</td>
                  <td className="px-3 py-2 text-right font-mono text-muted">
                    <span className="inline-flex items-center gap-1">
                      <Clock aria-hidden="true" size={11} />
                      {formatNumber(run.duration_ms)}<span className="text-[10px]"> ms</span>
                    </span>
                  </td>
                  <td className="px-3 py-2 font-mono text-muted">
                    <p>{formatTimestamp(run.started_at)}</p>
                    <p className="mt-0.5 text-[10px] text-muted/70">finished {formatTimestamp(run.completed_at)}</p>
                  </td>
                  <td className="px-3 py-2">
                    <Button
                      aria-label={`Inspect profile ${run.profile_id}`}
                      onClick={(event) => {
                        event.stopPropagation()
                        onSelectProfile(run.profile_id)
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

      <div className="flex flex-col items-start gap-2 text-xs text-muted sm:flex-row sm:items-center sm:justify-between">
        <p>Page {page} of {Math.max(totalPages, 1)} · {formatNumber(totalItems)} total runs · page size {pageSize}</p>
        <div className="flex items-center gap-2">
          <Button
            disabled={page <= 1}
            onClick={() => onPageChange(page - 1)}
            size="sm"
            variant="secondary"
          >
            Previous
          </Button>
          <Button
            disabled={page >= totalPages}
            onClick={() => onPageChange(page + 1)}
            size="sm"
            variant="secondary"
          >
            Next
          </Button>
        </div>
      </div>
    </div>
  )
}
