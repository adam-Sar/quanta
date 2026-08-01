import { AlertOctagon, Radar } from 'lucide-react'
import { Link } from 'react-router-dom'

import type { FindingResponse, FindingSeverity } from '../../types/api'
import { formatNumber, formatTimestamp } from '../../lib/utils'
import { Badge } from '../ui/Badge'
import { SeverityBadge } from '../ui/SeverityBadge'
import { Panel, SectionHeading } from '../ui/Panel'

interface FindingsPreviewProps {
  datasetId: string
  items: FindingResponse[]
  total: number
}

const severityOrder: FindingSeverity[] = ['critical', 'high', 'medium', 'low', 'info']

function topFindings(items: FindingResponse[], limit: number) {
  return [...items]
    .sort((left, right) => {
      const diff = severityOrder.indexOf(left.severity) - severityOrder.indexOf(right.severity)
      if (diff !== 0) return diff
      return right.value - left.value
    })
    .slice(0, limit)
}

export function FindingsPreview({ datasetId, items, total }: FindingsPreviewProps) {
  const top = topFindings(items, 5)

  return (
    <Panel>
      <SectionHeading
        description="The top five findings by severity explain why the quality score is what it is. Open the dedicated findings view for filtering, sorting, and full detail payloads."
        eyebrow="Signal"
        title="Key findings"
        action={
          <div className="flex flex-wrap items-center justify-end gap-1">
            <Badge dot tone="muted">{formatNumber(total)} total</Badge>
            <Link
              className="inline-flex items-center gap-1 rounded border border-line bg-elevated px-2 py-1 text-[11px] font-semibold tracking-wide text-muted hover:border-accent/60 hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
              to={`/datasets/${datasetId}/findings`}
            >
              <Radar aria-hidden="true" size={11} />
              Open findings
            </Link>
          </div>
        }
      />
      <div className="mt-6 space-y-3">
        {top.length === 0 ? (
          <div className="flex items-center gap-3 rounded-md border border-dashed border-line bg-canvas/30 px-4 py-6 text-sm text-muted">
            <AlertOctagon aria-hidden="true" size={18} className="text-success" />
            <span>No findings have been recorded for this dataset yet.</span>
          </div>
        ) : null}
        {top.map((finding) => (
          <article
            className="grid gap-3 rounded-md border border-line bg-canvas/30 px-4 py-3.5 sm:grid-cols-[auto_1fr_auto] sm:items-center"
            key={finding.finding_id}
          >
            <SeverityBadge severity={finding.severity} />
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-ink">{finding.description}</p>
              <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted">
                <span className="font-mono uppercase tracking-[0.1em]">{finding.kind.replace('_', ' ')}</span>
                {finding.column_name ? <span>· column <span className="font-mono text-ink/80">{finding.column_name}</span></span> : null}
                <span>· metric <span className="font-mono text-ink/80">{finding.metric}</span></span>
                <span>· value <span className="font-mono text-ink/80">{finding.value.toFixed(3)}</span> / threshold <span className="font-mono text-ink/80">{finding.threshold.toFixed(3)}</span></span>
              </p>
            </div>
            <span className="font-mono text-[11px] text-muted">{formatTimestamp(finding.finding_id ? finding.finding_id : '')}</span>
          </article>
        ))}
      </div>
    </Panel>
  )
}
