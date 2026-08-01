import { useMemo, useState } from 'react'
import { ArrowUpDown, Eye, Hourglass } from 'lucide-react'

import type { JobResponse, JobStatus } from '../../types/api'
import { formatNumber, formatTimestamp } from '../../lib/utils'
import { Badge } from '../ui/Badge'
import { Button } from '../ui/Button'
import { EmptyState } from '../ui/EmptyState'
import { Panel, SectionHeading } from '../ui/Panel'
import { cn } from '../../lib/utils'

type SortKey = 'created_at' | 'status' | 'kind'

interface JobsTableProps {
  runs: JobResponse[]
  selectedJobId: string | null
  onSelectJob: (jobId: string) => void
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

const STATUS_TONE: Record<JobStatus, 'success' | 'warning' | 'danger' | 'muted'> = {
  succeeded: 'success',
  running: 'warning',
  pending: 'muted',
  failed: 'danger',
}

const STATUS_LABEL: Record<JobStatus, string> = {
  succeeded: 'Succeeded',
  running: 'Running',
  pending: 'Pending',
  failed: 'Failed',
}

export function JobsTable({
  runs,
  selectedJobId,
  onSelectJob,
  page,
  pageSize,
  totalItems,
  totalPages,
  onPageChange,
}: JobsTableProps) {
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
      } else if (sortKey === 'status') {
        const order = { running: 0, pending: 1, succeeded: 2, failed: 3 } as Record<JobStatus, number>
        comparison = order[left.status] - order[right.status]
      } else if (sortKey === 'kind') {
        comparison = left.kind.localeCompare(right.kind)
      }
      return sortDirection === 'asc' ? comparison : -comparison
    })
  }, [runs, sortKey, sortDirection])

  if (runs.length === 0) {
    return (
      <Panel padded={false}>
        <div className="border-b border-line px-5 py-5">
          <SectionHeading
            description="Every job is persisted as an immutable jobs row. The lifecycle (pending → running → succeeded | failed) is recorded for every synchronous run."
            eyebrow="Jobs"
            title="Job history"
            action={<Badge dot tone="muted">No runs</Badge>}
          />
        </div>
        <div className="p-5">
          <EmptyState
            className="py-8"
            description="The synchronous job runner has not been triggered for this dataset yet. Run a job from above to compute the first batch."
            icon={Hourglass}
            title="No jobs"
          />
        </div>
      </Panel>
    )
  }

  return (
    <Panel padded={false}>
      <div className="border-b border-line px-5 py-5">
        <SectionHeading
          description="Every job is persisted as an immutable jobs row. Click a row to load its structured result and lifecycle above."
          eyebrow="Jobs"
          title="Job history"
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
              <th className="px-3 py-2">Job id</th>
              <th className="px-3 py-2"><SortButton active={sortKey === 'kind'} direction={sortDirection} label="Kind" onClick={() => handleSort('kind')} /></th>
              <th className="px-3 py-2"><SortButton active={sortKey === 'status'} direction={sortDirection} label="Status" onClick={() => handleSort('status')} /></th>
              <th className="px-3 py-2">Title</th>
              <th className="px-3 py-2"><SortButton active={sortKey === 'created_at'} direction={sortDirection} label="Created" onClick={() => handleSort('created_at')} /></th>
              <th className="px-3 py-2"><span className="sr-only">Inspect</span></th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((row) => {
              const isSelected = row.job_id === selectedJobId
              return (
                <tr
                  className={cn(
                    'cursor-pointer border-b border-line/40 last:border-b-0 hover:bg-canvas',
                    isSelected && 'bg-accent/5 hover:bg-accent/10',
                  )}
                  key={row.job_id}
                  onClick={() => onSelectJob(row.job_id)}
                >
                  <td className="px-3 py-2 font-mono text-ink">
                    <p>{row.job_id.slice(0, 8)}</p>
                    <p className="mt-0.5 text-[10px] text-muted">{row.formula_version}</p>
                  </td>
                  <td className="px-3 py-2 font-mono text-ink">{row.kind}</td>
                  <td className="px-3 py-2">
                    <Badge dot tone={STATUS_TONE[row.status]}>{STATUS_LABEL[row.status]}</Badge>
                  </td>
                  <td className="px-3 py-2 text-ink max-w-[320px] truncate" title={row.title}>{row.title}</td>
                  <td className="px-3 py-2 font-mono text-muted">{formatTimestamp(row.created_at)}</td>
                  <td className="px-3 py-2">
                    <Button
                      aria-label={`Inspect job ${row.job_id}`}
                      onClick={(event) => {
                        event.stopPropagation()
                        onSelectJob(row.job_id)
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
        <p>Page {page} of {Math.max(totalPages, 1)} · {formatNumber(totalItems)} total jobs · page size {pageSize}</p>
        <div className="flex items-center gap-2">
          <Button disabled={page <= 1} onClick={() => onPageChange(page - 1)} size="sm" variant="secondary">Previous</Button>
          <Button disabled={page >= totalPages} onClick={() => onPageChange(page + 1)} size="sm" variant="secondary">Next</Button>
        </div>
      </div>
    </Panel>
  )
}
