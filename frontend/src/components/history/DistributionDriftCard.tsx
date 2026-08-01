import { BarChart3, Sigma } from 'lucide-react'
import { useMemo } from 'react'

import type { DistributionDriftResponse, NumericDriftResponse } from '../../types/api'
import { formatNumber } from '../../lib/utils'
import { Badge } from '../ui/Badge'
import { EmptyState } from '../ui/EmptyState'
import { Panel, SectionHeading } from '../ui/Panel'

interface DistributionDriftCardProps {
  drift: DistributionDriftResponse | null
}

const NUMERIC_MEDIUM = 0.2
const NUMERIC_HIGH = 0.5
const PSI_LOW = 0.1
const PSI_MEDIUM = 0.2

function numericTone(relative: number | null): 'success' | 'warning' | 'danger' | 'muted' {
  if (relative === null) return 'muted'
  if (relative >= NUMERIC_HIGH) return 'danger'
  if (relative >= NUMERIC_MEDIUM) return 'warning'
  return 'success'
}

function numericLabel(relative: number | null): string {
  if (relative === null) return 'Missing'
  if (relative >= NUMERIC_HIGH) return 'High drift'
  if (relative >= NUMERIC_MEDIUM) return 'Medium drift'
  return 'Within band'
}

function psiTone(psi: number): 'success' | 'warning' | 'danger' {
  if (psi >= PSI_MEDIUM) return 'danger'
  if (psi >= PSI_LOW) return 'warning'
  return 'success'
}

function psiLabel(psi: number): string {
  if (psi >= PSI_MEDIUM) return 'Hard categorical drift'
  if (psi >= PSI_LOW) return 'Soft categorical drift'
  return 'Stable distribution'
}

function formatNullableNumber(value: number | null, fractionDigits = 3): string {
  if (value === null || value === undefined) return '—'
  if (Number.isInteger(value)) return value.toLocaleString('en-US')
  return value.toLocaleString('en-US', { maximumFractionDigits: fractionDigits })
}

export function DistributionDriftCard({ drift }: DistributionDriftCardProps) {
  const numericByColumn = useMemo(() => {
    if (!drift) return new Map<string, NumericDriftResponse[]>()
    const map = new Map<string, NumericDriftResponse[]>()
    for (const row of drift.numeric) {
      const list = map.get(row.column) ?? []
      list.push(row)
      map.set(row.column, list)
    }
    return map
  }, [drift])

  if (!drift) {
    return (
      <Panel className="border-l-2 border-l-line">
        <SectionHeading
          description="Pick a comparison to inspect its numeric and categorical drift."
          eyebrow="Distribution drift"
          title="No comparison selected"
          action={<Badge dot tone="muted">No selection</Badge>}
        />
      </Panel>
    )
  }

  const numericColumns = Array.from(numericByColumn.keys()).sort()
  const totalNumericRows = drift.numeric.length
  const totalCategoricalRows = drift.categorical.length

  return (
    <Panel>
      <SectionHeading
        description="The backend derives the numeric and categorical drift from the persisted profile metrics and top values. Thresholds follow the documented HISTORY_* settings."
        eyebrow="Distribution drift"
        title="Columns"
        action={
          <div className="flex flex-wrap items-center justify-end gap-1">
            <Badge dot tone="muted">{totalNumericRows} numeric</Badge>
            <Badge dot tone="muted">{totalCategoricalRows} categorical</Badge>
          </div>
        }
      />

      {totalNumericRows === 0 ? (
        <p className="mt-3 rounded-md border border-dashed border-line bg-surface-2 px-4 py-4 text-sm text-muted">
          The two versions share no numeric columns, or no numeric drift was detected.
        </p>
      ) : null}

      {numericColumns.length > 0 ? (
        <div className="mt-6">
          <h3 className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted">
            <Sigma aria-hidden="true" size={14} />
            Numeric drift
          </h3>
          <div className="mt-2 overflow-hidden rounded-md border border-line">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-line bg-surface-2 text-[10px] uppercase tracking-[0.12em] text-muted">
                  <th className="px-4 py-2">Column</th>
                  <th className="px-4 py-2">Metric</th>
                  <th className="px-4 py-2 text-right">Base</th>
                  <th className="px-4 py-2 text-right">Target</th>
                  <th className="px-4 py-2 text-right">Absolute</th>
                  <th className="px-4 py-2 text-right">Relative</th>
                  <th className="px-4 py-2">Note</th>
                </tr>
              </thead>
              <tbody>
                {drift.numeric.map((row) => (
                  <tr className="border-b border-line/40 last:border-b-0" key={`${row.column}-${row.metric}`}>
                    <td className="px-4 py-2 font-mono text-ink">{row.column}</td>
                    <td className="px-4 py-2 font-mono text-muted">{row.metric}</td>
                    <td className="px-4 py-2 text-right font-mono text-muted">{formatNullableNumber(row.base_value)}</td>
                    <td className="px-4 py-2 text-right font-mono text-ink">{formatNullableNumber(row.target_value)}</td>
                    <td className="px-4 py-2 text-right font-mono text-ink">{formatNullableNumber(row.absolute_change)}</td>
                    <td className="px-4 py-2 text-right font-mono text-ink">{row.relative_change === null ? '—' : `${(row.relative_change * 100).toFixed(1)}%`}</td>
                    <td className="px-4 py-2"><Badge dot tone={numericTone(row.relative_change)}>{numericLabel(row.relative_change)}</Badge></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      {totalCategoricalRows === 0 ? (
        <p className="mt-6 rounded-md border border-dashed border-line bg-surface-2 px-4 py-4 text-sm text-muted">
          The two versions share no categorical columns, or no categorical drift was detected.
        </p>
      ) : null}

      {drift.categorical.length > 0 ? (
        <div className="mt-6">
          <h3 className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted">
            <BarChart3 aria-hidden="true" size={14} />
            Categorical drift (PSI)
          </h3>
          <div className="mt-2 overflow-hidden rounded-md border border-line">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-line bg-surface-2 text-[10px] uppercase tracking-[0.12em] text-muted">
                  <th className="px-4 py-2">Column</th>
                  <th className="px-4 py-2 text-right">PSI</th>
                  <th className="px-4 py-2">Top base values</th>
                  <th className="px-4 py-2">Top target values</th>
                  <th className="px-4 py-2">Note</th>
                </tr>
              </thead>
              <tbody>
                {drift.categorical.map((row) => (
                  <tr className="border-b border-line/40 last:border-b-0" key={`psi-${row.column}`}>
                    <td className="px-4 py-2 font-mono text-ink">{row.column}</td>
                    <td className="px-4 py-2 text-right font-mono text-ink">{formatNumber(row.psi, 4)}</td>
                    <td className="px-4 py-2 text-[11px] text-muted">{summarizeTopValues(row.base_top_values)}</td>
                    <td className="px-4 py-2 text-[11px] text-muted">{summarizeTopValues(row.target_top_values)}</td>
                    <td className="px-4 py-2"><Badge dot tone={psiTone(row.psi)}>{psiLabel(row.psi)}</Badge></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      {totalNumericRows === 0 && totalCategoricalRows === 0 ? (
        <div className="mt-6">
          <EmptyState
            description="The two versions are aligned on every metric. No drift was detected."
            icon={BarChart3}
            title="No distribution drift"
          />
        </div>
      ) : null}
    </Panel>
  )
}

function summarizeTopValues(values: Array<Record<string, unknown>>): string {
  if (!Array.isArray(values) || values.length === 0) return '—'
  return values
    .slice(0, 3)
    .map((entry) => {
      const value = entry.value ?? entry.name ?? entry.key ?? JSON.stringify(entry)
      const frequency = entry.frequency ?? entry.proportion
      if (typeof frequency === 'number') {
        return `${value} (${(frequency * 100).toFixed(0)}%)`
      }
      return `${value}`
    })
    .join(' · ')
}
