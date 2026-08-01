import { GitBranch, Layers } from 'lucide-react'

import type { DatasetVersionResponse, LineageEdgeResponse, LineageResponse } from '../../types/api'
import { formatNumber, formatTimestamp } from '../../lib/utils'
import { Badge } from '../ui/Badge'
import { Panel, SectionHeading } from '../ui/Panel'

interface LineageChainProps {
  lineage: LineageResponse | null
  versionsById: Record<string, DatasetVersionResponse>
}

function describeVersionLabel(version: DatasetVersionResponse | null | undefined): { label: string; tone: 'success' | 'muted' } {
  if (!version) return { label: 'Unknown', tone: 'muted' }
  return { label: `v${version.version_number}`, tone: 'muted' }
}

export function LineageChain({ lineage, versionsById }: LineageChainProps) {
  if (!lineage) {
    return (
      <Panel className="border-l-2 border-l-line">
        <SectionHeading
          description="The backend derives the lineage edges by walking the version chain ordered by version_number."
          eyebrow="Lineage"
          title="No lineage yet"
          action={<Badge dot tone="muted">No edges</Badge>}
        />
      </Panel>
    )
  }

  const edges: LineageEdgeResponse[] = lineage.edges
  if (edges.length === 0) {
    return (
      <Panel>
        <SectionHeading
          description="A dataset with a single version returns no edges. The lineage appears as soon as a second version is uploaded."
          eyebrow="Lineage"
          title="Single version"
          action={<Badge dot tone="muted">No chain</Badge>}
        />
        <div className="mt-4 rounded-md border border-dashed border-line bg-surface-2 px-4 py-6 text-sm text-muted">
          Upload a second version of this dataset to start the lineage chain.
        </div>
      </Panel>
    )
  }

  return (
    <Panel>
      <SectionHeading
        description="The backend derives the lineage edges by walking the version chain ordered by version_number. Edges are not persisted because the underlying version rows are already immutable."
        eyebrow="Lineage"
        title="Version chain"
        action={
          <div className="flex flex-wrap items-center justify-end gap-1">
            <Badge dot tone="muted">{formatNumber(edges.length)} edge{edges.length === 1 ? '' : 's'}</Badge>
          </div>
        }
      />

      <ol className="mt-6 space-y-3">
        {edges.map((edge) => {
          const fromVersion = versionsById[edge.from_version_id]
          const toVersion = versionsById[edge.to_version_id]
          const fromLabel = describeVersionLabel(fromVersion)
          const toLabel = describeVersionLabel(toVersion)
          return (
            <li
              className="grid gap-2 rounded-md border border-line bg-surface-2 px-4 py-3 sm:grid-cols-[auto_1fr_auto_1fr_auto] sm:items-center"
              key={`${edge.from_version_id}-${edge.to_version_id}`}
            >
              <div className="flex items-center gap-2">
                <span className="rounded border border-line bg-elevated px-2 py-0.5 font-mono text-xs text-ink">{fromLabel.label}</span>
                {fromVersion ? <Badge dot tone="muted">{fromVersion.original_filename}</Badge> : null}
              </div>
              <div className="text-[11px] text-muted">
                <p className="font-mono">{edge.from_version_id.slice(0, 8)}</p>
                {fromVersion ? <p>{formatNumber(fromVersion.row_count, 0)} rows · {formatNumber(fromVersion.column_count, 0)} columns · {formatTimestamp(fromVersion.created_at)}</p> : null}
              </div>
              <div className="flex flex-col items-center gap-1 text-muted">
                <GitBranch aria-hidden="true" size={14} />
                <span aria-hidden="true" className="text-[10px]">→</span>
              </div>
              <div className="text-[11px] text-muted">
                <p className="font-mono">{edge.to_version_id.slice(0, 8)}</p>
                {toVersion ? <p>{formatNumber(toVersion.row_count, 0)} rows · {formatNumber(toVersion.column_count, 0)} columns · {formatTimestamp(toVersion.created_at)}</p> : null}
              </div>
              <div className="flex items-center gap-2">
                {toVersion ? <Badge dot tone="muted">{toVersion.original_filename}</Badge> : null}
                <span className="rounded border border-line bg-elevated px-2 py-0.5 font-mono text-xs text-ink">{toLabel.label}</span>
              </div>
            </li>
          )
        })}
      </ol>

      <div className="mt-6 flex items-center gap-2 text-xs text-muted">
        <Layers aria-hidden="true" size={14} />
        <span>Edges are derived from <code className="font-mono text-ink-soft">DatasetVersion.version_number</code> and <code className="font-mono text-ink-soft">created_at</code>.</span>
      </div>
    </Panel>
  )
}
