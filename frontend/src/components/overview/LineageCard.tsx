import { History as HistoryIcon } from 'lucide-react'

import type { LineageResponse } from '../../types/api'
import { formatTimestamp } from '../../lib/utils'
import { EmptyState } from '../ui/EmptyState'
import { Panel, SectionHeading } from '../ui/Panel'

interface LineageCardProps {
  lineage: LineageResponse
}

export function LineageCard({ lineage }: LineageCardProps) {
  const edges = lineage.edges

  return (
    <Panel>
      <SectionHeading
        description="Lineage is computed deterministically from the immutable version chain; no separate table is required."
        eyebrow="Version chain"
        title="Lineage"
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
                <span className="absolute -left-[26px] top-2 inline-flex h-3 w-3 -translate-x-1/2 rounded-full border-2 border-canvas bg-accent" aria-hidden="true" />
                <div className="flex flex-col gap-1 rounded-md border border-line bg-canvas/30 px-4 py-3">
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
