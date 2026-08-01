import { History as HistoryIcon, GitCompare } from 'lucide-react'
import { Link } from 'react-router-dom'

import type { LineageResponse } from '../../types/api'
import { formatTimestamp } from '../../lib/utils'
import { Badge } from '../ui/Badge'
import { EmptyState } from '../ui/EmptyState'
import { Panel, SectionHeading } from '../ui/Panel'

interface LineageCardProps {
  datasetId: string
  lineage: LineageResponse
}

export function LineageCard({ datasetId, lineage }: LineageCardProps) {
  const edges = lineage.edges

  return (
    <Panel>
      <SectionHeading
        description="Lineage is computed deterministically from the immutable version chain; no separate table is required."
        eyebrow="Version chain"
        title="Lineage"
        action={
          <div className="flex flex-wrap items-center justify-end gap-1">
            <Badge dot tone="muted">{edges.length} edge{edges.length === 1 ? '' : 's'}</Badge>
            <Link
              className="inline-flex items-center gap-1 rounded border border-line bg-elevated px-2 py-1 text-[11px] font-semibold tracking-wide text-muted hover:border-accent/60 hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
              to={`/datasets/${datasetId}/history`}
            >
              <GitCompare aria-hidden="true" size={11} />
              Open history
            </Link>
          </div>
        }
      />
      <div className="mt-6">
        {edges.length === 0 ? (
          <EmptyState
            description="This dataset has only one version. A lineage chain appears once a second version is uploaded."
            icon={HistoryIcon}
            title="No lineage edges yet"
          />
        ) : (
          <ol className="relative space-y-4 border-l border-line pl-5">
            {edges.map((edge) => (
              <li className="relative" key={`${edge.from_version_id}-${edge.to_version_id}`}>
                <span className="absolute -left-[26px] top-2 inline-flex h-3 w-3 -translate-x-1/2 rounded-full border-2 border-line bg-accent" aria-hidden="true" />
                <div className="flex flex-col gap-1 rounded-md border border-line bg-surface-2 px-4 py-3">
                  <p className="text-xs font-medium text-ink">
                    v{edge.from_version_number} → v{edge.to_version_number}
                  </p>
                  <p className="text-[11px] text-muted">Created {formatTimestamp(edge.to_created_at)}</p>
                </div>
              </li>
            ))}
          </ol>
        )}
      </div>
    </Panel>
  )
}
