import { BarChart3, CalendarClock, Hash, Ruler, Type } from 'lucide-react'
import { useMemo } from 'react'

import type { ColumnProfileResponse } from '../../types/api'
import { formatNumber, formatTimestamp } from '../../lib/utils'
import { Badge } from '../ui/Badge'
import { Panel, SectionHeading } from '../ui/Panel'

interface ColumnProfileDetailCardProps {
  column: ColumnProfileResponse | null
}

interface MetricBlockProps {
  label: string
  value: string
  caption?: string
}

function MetricBlock({ label, value, caption }: MetricBlockProps) {
  return (
    <div className="rounded-md border border-line bg-surface-2 px-4 py-3.5">
      <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted">{label}</p>
      <p className="mt-2 text-base font-semibold text-ink">{value}</p>
      {caption ? <p className="mt-1 text-xs text-muted">{caption}</p> : null}
    </div>
  )
}

function formatNumericValue(value: number | null): string {
  if (value === null || value === undefined) return '—'
  if (Number.isInteger(value)) return value.toLocaleString('en-US')
  return Number(value).toLocaleString('en-US', { maximumFractionDigits: 4 })
}

export function ColumnProfileDetailCard({ column }: ColumnProfileDetailCardProps) {
  const topValues = useMemo(() => column?.metrics.top_values ?? [], [column])
  const hasNumeric = column !== null && (
    column.metrics.numeric.min !== null
    || column.metrics.numeric.max !== null
    || column.metrics.numeric.mean !== null
  )
  const hasTemporal = column !== null && (
    column.metrics.temporal.min !== null
    || column.metrics.temporal.max !== null
  )
  const hasStringLength = column !== null && (
    column.metrics.string_length.min !== null
    || column.metrics.string_length.max !== null
  )

  if (!column) {
    return (
      <Panel className="border-l-2 border-l-line">
        <SectionHeading
          description="Select a column from the table to inspect its detailed metrics."
          eyebrow="Column detail"
          title="Pick a column"
          action={<Badge dot tone="muted">No selection</Badge>}
        />
        <div className="mt-6 flex items-center gap-3 text-sm text-muted">
          <BarChart3 aria-hidden="true" size={18} />
          <span>No column is currently selected. The detailed metrics will render here.</span>
        </div>
      </Panel>
    )
  }

  const { metrics } = column
  const nullTone = metrics.null_rate >= 0.5 ? 'danger' : metrics.null_rate >= 0.1 ? 'warning' : 'success'
  const distinctTone = metrics.distinct_rate >= 0.9 ? 'info' : metrics.distinct_rate >= 0.5 ? 'success' : 'muted'

  return (
    <Panel>
      <SectionHeading
        description="The backend persisted these metrics as JSONB on the latest profile. The frontend does not recompute them."
        eyebrow="Column detail"
        title={column.name}
        action={
          <div className="flex flex-wrap items-center justify-end gap-1">
            <Badge dot tone="muted">{metrics.physical_type}</Badge>
            <Badge dot tone={nullTone}>Nulls {(metrics.null_rate * 100).toFixed(1)}%</Badge>
            <Badge dot tone={distinctTone}>Distinct {(metrics.distinct_rate * 100).toFixed(1)}%</Badge>
          </div>
        }
      />

      <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MetricBlock caption={`of ${formatNumber(metrics.sample_size)} rows considered`} label="Null count" value={formatNumber(metrics.null_count)} />
        <MetricBlock caption={`distinct values over ${formatNumber(metrics.sample_size)}`} label="Distinct count" value={formatNumber(metrics.distinct_count)} />
        <MetricBlock caption="rows with a value" label="Non-null count" value={formatNumber(metrics.non_null_count)} />
        <MetricBlock caption="physical_type, position" label="Type" value={metrics.physical_type} />
      </div>

      {hasNumeric ? (
        <div className="mt-6 rounded-md border border-line bg-surface-2 p-5">
          <div className="flex items-center gap-2 text-ink">
            <Hash aria-hidden="true" size={15} />
            <h3 className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted">Numeric metrics</h3>
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-3 xl:grid-cols-6">
            <MetricBlock label="Min" value={formatNumericValue(metrics.numeric.min)} />
            <MetricBlock label="Max" value={formatNumericValue(metrics.numeric.max)} />
            <MetricBlock label="Mean" value={formatNumericValue(metrics.numeric.mean)} />
            <MetricBlock label="Median" value={formatNumericValue(metrics.numeric.median)} />
            <MetricBlock label="Std dev" value={formatNumericValue(metrics.numeric.std)} />
            <MetricBlock label="Sum" value={formatNumericValue(metrics.numeric.sum)} />
          </div>
        </div>
      ) : null}

      {hasTemporal ? (
        <div className="mt-4 rounded-md border border-line bg-surface-2 p-5">
          <div className="flex items-center gap-2 text-ink">
            <CalendarClock aria-hidden="true" size={15} />
            <h3 className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted">Temporal range</h3>
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <MetricBlock label="Min" value={formatTimestamp(metrics.temporal.min)} caption={metrics.temporal.min ?? undefined} />
            <MetricBlock label="Max" value={formatTimestamp(metrics.temporal.max)} caption={metrics.temporal.max ?? undefined} />
          </div>
        </div>
      ) : null}

      {hasStringLength ? (
        <div className="mt-4 rounded-md border border-line bg-surface-2 p-5">
          <div className="flex items-center gap-2 text-ink">
            <Ruler aria-hidden="true" size={15} />
            <h3 className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted">String length</h3>
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            <MetricBlock label="Min" value={formatNumber(metrics.string_length.min)} />
            <MetricBlock label="Max" value={formatNumber(metrics.string_length.max)} />
            <MetricBlock label="Mean" value={formatNumericValue(metrics.string_length.mean)} />
          </div>
        </div>
      ) : null}

      <div className="mt-6">
        <div className="flex items-center gap-2 text-ink">
          <Type aria-hidden="true" size={15} />
          <h3 className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted">Top values</h3>
        </div>
        {topValues.length === 0 ? (
          <p className="mt-3 rounded-md border border-dashed border-line bg-surface-2 px-4 py-3 text-sm text-muted">
            The backend did not record any top values for this column.
          </p>
        ) : (
          <div className="mt-3 overflow-hidden rounded-md border border-line">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-line bg-surface-2 text-[10px] uppercase tracking-[0.12em] text-muted">
                  <th className="px-4 py-2">Value</th>
                  <th className="px-4 py-2 text-right">Count</th>
                  <th className="px-4 py-2 text-right">Frequency</th>
                </tr>
              </thead>
              <tbody>
                {topValues.map((entry) => (
                  <tr className="border-b border-line/40 last:border-b-0" key={`${column.name}-${entry.value}`}>
                    <td className="px-4 py-2 font-mono text-ink">{entry.value}</td>
                    <td className="px-4 py-2 text-right font-mono text-ink">{formatNumber(entry.count)}</td>
                    <td className="px-4 py-2 text-right font-mono text-muted">{(entry.frequency * 100).toFixed(2)}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </Panel>
  )
}
