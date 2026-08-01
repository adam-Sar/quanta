import { ClipboardList, FileText, Inbox, KeyRound, Sigma, Tag } from 'lucide-react'
import { useMemo } from 'react'

import type { FindingResponse, FindingSeverity } from '../../types/api'
import { Badge } from '../ui/Badge'
import { Panel, SectionHeading } from '../ui/Panel'
import { SeverityBadge } from '../ui/SeverityBadge'

interface FindingDetailCardProps {
  finding: FindingResponse | null
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

const kindLabels: Record<FindingResponse['kind'], string> = {
  missingness: 'Missingness',
  duplicates: 'Duplicates',
  invalid_values: 'Invalid values',
  outlier: 'Outliers',
  cardinality: 'Cardinality',
}

function describeSeverityTone(severity: FindingSeverity): { tone: 'danger' | 'warning' | 'info' | 'muted'; label: string } {
  if (severity === 'critical' || severity === 'high') return { tone: 'danger', label: 'Action recommended' }
  if (severity === 'medium') return { tone: 'warning', label: 'Review recommended' }
  if (severity === 'low') return { tone: 'info', label: 'Worth noting' }
  return { tone: 'muted', label: 'Informational' }
}

function formatValue(value: number): string {
  if (Number.isInteger(value)) return value.toLocaleString('en-US')
  return value.toLocaleString('en-US', { maximumFractionDigits: 4 })
}

function formatDetailValue(value: unknown): string {
  if (value === null || value === undefined) return '—'
  if (typeof value === 'number') return formatValue(value)
  if (typeof value === 'boolean') return value ? 'true' : 'false'
  if (typeof value === 'string') return value
  if (Array.isArray(value)) return value.map((entry) => formatDetailValue(entry)).join(', ')
  if (typeof value === 'object') return JSON.stringify(value)
  return String(value)
}

export function FindingDetailCard({ finding }: FindingDetailCardProps) {
  const detailEntries = useMemo(() => {
    if (!finding) return []
    return Object.entries(finding.details)
  }, [finding])

  if (!finding) {
    return (
      <Panel className="border-l-2 border-l-line">
        <SectionHeading
          description="Select a finding from the table to inspect its full metric, threshold, and detail payload."
          eyebrow="Finding detail"
          title="Pick a finding"
          action={<Badge dot tone="muted">No selection</Badge>}
        />
        <div className="mt-6 flex items-center gap-3 text-sm text-muted">
          <Inbox aria-hidden="true" size={18} />
          <span>No finding is currently selected. The structured metric and detail payload will render here.</span>
        </div>
      </Panel>
    )
  }

  const severityTone = describeSeverityTone(finding.severity)
  const ratio = finding.threshold > 0 ? finding.value / finding.threshold : null

  return (
    <Panel>
      <SectionHeading
        description="The backend persisted these values on the immutable Finding row bound to the latest profile. The frontend never recomputes severity or metrics."
        eyebrow="Finding detail"
        title={finding.description}
        action={
          <div className="flex flex-wrap items-center justify-end gap-1">
            <SeverityBadge severity={finding.severity} />
            <Badge dot tone={severityTone.tone}>{severityTone.label}</Badge>
          </div>
        }
      />

      <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MetricBlock
          caption={kindLabels[finding.kind]}
          label="Detector"
          value={finding.kind}
        />
        <MetricBlock
          caption={finding.column_name ?? 'no specific column'}
          label="Affected column"
          value={finding.column_name ?? '—'}
        />
        <MetricBlock
          caption="observed value"
          label="Value"
          value={formatValue(finding.value)}
        />
        <MetricBlock
          caption="configured threshold"
          label="Threshold"
          value={formatValue(finding.threshold)}
        />
      </div>

      {ratio !== null ? (
        <div className="mt-3 rounded-md border border-line bg-surface-2 p-4">
          <div className="flex items-center gap-2 text-ink">
            <Sigma aria-hidden="true" size={14} />
            <h3 className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted">Value / threshold ratio</h3>
          </div>
          <p className="mt-2 font-mono text-base text-ink">{formatValue(ratio)}×</p>
          <p className="mt-1 text-xs text-muted">
            The observed value is {formatValue(ratio)}× the configured threshold for metric <span className="font-mono text-ink-soft">{finding.metric}</span>.
          </p>
        </div>
      ) : null}

      <div className="mt-6">
        <div className="flex items-center gap-2 text-ink">
          <FileText aria-hidden="true" size={15} />
          <h3 className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted">Description</h3>
        </div>
        <p className="mt-2 text-sm leading-6 text-ink">{finding.description}</p>
      </div>

      <div className="mt-6">
        <div className="flex items-center gap-2 text-ink">
          <Tag aria-hidden="true" size={15} />
          <h3 className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted">Tags</h3>
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-1">
          <Badge dot tone="muted">{kindLabels[finding.kind]}</Badge>
          <Badge dot tone="muted">metric {finding.metric}</Badge>
          {finding.column_name ? <Badge dot tone="muted">column {finding.column_name}</Badge> : null}
        </div>
      </div>

      <div className="mt-6">
        <div className="flex items-center gap-2 text-ink">
          <ClipboardList aria-hidden="true" size={15} />
          <h3 className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted">Detail payload</h3>
        </div>
        {detailEntries.length === 0 ? (
          <p className="mt-3 rounded-md border border-dashed border-line bg-surface-2 px-4 py-3 text-sm text-muted">
            The backend did not record any structured detail for this finding.
          </p>
        ) : (
          <div className="mt-3 overflow-hidden rounded-md border border-line">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-line bg-surface-2 text-[10px] uppercase tracking-[0.12em] text-muted">
                  <th className="px-4 py-2">Key</th>
                  <th className="px-4 py-2">Value</th>
                </tr>
              </thead>
              <tbody>
                {detailEntries.map(([key, value]) => (
                  <tr className="border-b border-line/40 last:border-b-0" key={key}>
                    <td className="px-4 py-2 font-mono text-muted">{key}</td>
                    <td className="px-4 py-2 font-mono text-ink">{formatDetailValue(value)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="mt-6 flex items-center gap-2 border-t border-line pt-4 text-xs text-muted">
        <KeyRound aria-hidden="true" size={14} />
        <span>Finding id <span className="font-mono text-ink-soft">{finding.finding_id.slice(0, 8)}</span></span>
        <span aria-hidden="true">·</span>
        <span>Profile <span className="font-mono text-ink-soft">{finding.profile_id.slice(0, 8)}</span></span>
        <span aria-hidden="true">·</span>
        <span>Version <span className="font-mono text-ink-soft">{finding.dataset_version_id.slice(0, 8)}</span></span>
      </div>
    </Panel>
  )
}
