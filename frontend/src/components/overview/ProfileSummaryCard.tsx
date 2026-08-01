import { Columns3, Gauge, TableProperties } from 'lucide-react'
import { useMemo } from 'react'
import { Link } from 'react-router-dom'

import type { DatasetProfileResponse } from '../../types/api'
import { formatNumber } from '../../lib/utils'
import { Badge } from '../ui/Badge'
import { Panel, SectionHeading } from '../ui/Panel'

interface ProfileSummaryCardProps {
  profile: DatasetProfileResponse
  datasetId?: string
}

interface ColumnSummary {
  name: string
  null_rate: number
  distinct_count: number
  physical_type: string
  flag: 'high-null' | 'high-distinct' | 'constant' | 'normal'
}

const HIGH_NULL_THRESHOLD = 0.5
const HIGH_DISTINCT_THRESHOLD = 0.9
const CONSTANT_DISTINCT_THRESHOLD = 1

function classifyColumn(column: DatasetProfileResponse['columns'][number]): ColumnSummary['flag'] {
  if (column.metrics.null_rate >= HIGH_NULL_THRESHOLD) return 'high-null'
  if (column.metrics.distinct_count <= CONSTANT_DISTINCT_THRESHOLD) return 'constant'
  if (column.metrics.distinct_rate >= HIGH_DISTINCT_THRESHOLD) return 'high-distinct'
  return 'normal'
}

function describeFlag(flag: ColumnSummary['flag']) {
  if (flag === 'high-null') return { tone: 'warning' as const, label: 'High null rate' }
  if (flag === 'constant') return { tone: 'muted' as const, label: 'Constant column' }
  if (flag === 'high-distinct') return { tone: 'info' as const, label: 'High distinct rate' }
  return { tone: 'muted' as const, label: 'Within thresholds' }
}

export function ProfileSummaryCard({ profile, datasetId }: ProfileSummaryCardProps) {
  const summaries = useMemo<ColumnSummary[]>(() => {
    return profile.columns.map((column) => ({
      name: column.name,
      null_rate: column.metrics.null_rate,
      distinct_count: column.metrics.distinct_count,
      physical_type: column.metrics.physical_type,
      flag: classifyColumn(column),
    }))
  }, [profile])

  const flagged = summaries.filter((column) => column.flag !== 'normal').slice(0, 5)

  return (
    <Panel>
      <SectionHeading
        description="The profile is the input to every detector and to the quality score. Quanta never recomputes it; the backend persists the JSONB metrics."
        eyebrow="Profile summary"
        title="Profile"
        action={
          <div className="flex flex-wrap items-center justify-end gap-1">
            <Badge dot tone={profile.sampled === 'full' ? 'success' : 'info'}>{profile.sampled === 'full' ? 'Full sample' : 'Bounded sample'}</Badge>
            {datasetId ? (
              <Link className="inline-flex items-center gap-1 rounded border border-line bg-elevated px-2 py-1 text-[11px] font-semibold tracking-wide text-muted hover:border-accent/60 hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent" to={`/datasets/${datasetId}/profile`}>
                <TableProperties aria-hidden="true" size={11} />
                View full profile
              </Link>
            ) : null}
          </div>
        }
      />

      <div className="mt-6 grid gap-3 sm:grid-cols-3">
        <div className="rounded-md border border-line bg-surface-2 px-4 py-3.5">
          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted">Sample size</p>
          <p className="mt-2 text-xl font-semibold text-ink">{formatNumber(profile.sample_size)}</p>
          <p className="mt-1 text-xs text-muted">rows considered by the profiler</p>
        </div>
        <div className="rounded-md border border-line bg-surface-2 px-4 py-3.5">
          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted">Profile duration</p>
          <p className="mt-2 text-xl font-semibold text-ink">{formatNumber(profile.duration_ms)}<span className="text-sm text-muted"> ms</span></p>
          <p className="mt-1 text-xs text-muted">wall-clock for this run</p>
        </div>
        <div className="rounded-md border border-line bg-surface-2 px-4 py-3.5">
          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted">Columns</p>
          <p className="mt-2 text-xl font-semibold text-ink">{formatNumber(profile.columns.length)}</p>
          <p className="mt-1 text-xs text-muted">typed metrics captured</p>
        </div>
      </div>

      <div className="mt-6">
        <h3 className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted">Flagged columns</h3>
        {flagged.length === 0 ? (
          <p className="mt-3 rounded-md border border-dashed border-line bg-surface-2 px-4 py-3 text-sm text-muted">
            No columns currently breach the null or distinct thresholds the detectors inspect.
          </p>
        ) : (
          <div className="mt-3 overflow-hidden rounded-md border border-line">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-line bg-surface-2 text-[10px] uppercase tracking-[0.12em] text-muted">
                  <th className="px-4 py-2">Column</th>
                  <th className="px-4 py-2">Type</th>
                  <th className="px-4 py-2">Null rate</th>
                  <th className="px-4 py-2">Distinct</th>
                  <th className="px-4 py-2">Note</th>
                </tr>
              </thead>
              <tbody>
                {flagged.map((column) => {
                  const flag = describeFlag(column.flag)
                  return (
                    <tr className="border-b border-line/40 last:border-b-0" key={column.name}>
                      <td className="px-4 py-2 font-mono text-ink">{column.name}</td>
                      <td className="px-4 py-2 font-mono text-muted">{column.physical_type}</td>
                      <td className="px-4 py-2 font-mono text-ink">{(column.null_rate * 100).toFixed(1)}%</td>
                      <td className="px-4 py-2 font-mono text-ink">{formatNumber(column.distinct_count)}</td>
                      <td className="px-4 py-2"><Badge dot tone={flag.tone}>{flag.label}</Badge></td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="mt-6 flex items-center gap-2 border-t border-line pt-4 text-xs text-muted">
        <Gauge aria-hidden="true" size={14} />
        <span>Profile id <span className="font-mono text-ink-soft">{profile.profile_id.slice(0, 8)}</span></span>
        <span aria-hidden="true">·</span>
        <Columns3 aria-hidden="true" size={14} />
        <span>Version <span className="font-mono text-ink-soft">{profile.dataset_version_id.slice(0, 8)}</span></span>
      </div>
    </Panel>
  )
}
