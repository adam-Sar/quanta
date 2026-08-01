import { ArrowLeftRight, Columns3, FilePlus2, FileX2 } from 'lucide-react'

import type { ColumnDiffResponse, SchemaChangeType, SchemaDiffResponse } from '../../types/api'
import { Badge } from '../ui/Badge'
import { Panel, SectionHeading } from '../ui/Panel'

interface SchemaDiffCardProps {
  schemaDiff: SchemaDiffResponse | null
}

function changeTone(change: SchemaChangeType): 'success' | 'danger' | 'warning' {
  if (change === 'added') return 'success'
  if (change === 'removed') return 'danger'
  return 'warning'
}

function changeLabel(change: SchemaChangeType): string {
  if (change === 'added') return 'Added'
  if (change === 'removed') return 'Removed'
  return 'Type changed'
}

function TypeChangeRow({ column }: { column: ColumnDiffResponse }) {
  const baseType = column.base_physical_type ?? '—'
  const targetType = column.target_physical_type ?? '—'
  return (
    <li className="grid gap-2 border-b border-line/70 px-4 py-2.5 last:border-b-0 sm:grid-cols-[1.4fr_0.6fr_1.4fr] sm:items-center">
      <p className="font-mono text-ink">{column.name}</p>
      <Badge dot tone={changeTone(column.change)}>{changeLabel(column.change)}</Badge>
      <p className="flex items-center gap-2 font-mono text-[11px] text-muted">
        <span className="rounded border border-line bg-elevated px-1.5 py-0.5 text-ink">{baseType}</span>
        <ArrowLeftRight aria-hidden="true" className="text-muted/60" size={12} />
        <span className="rounded border border-line bg-elevated px-1.5 py-0.5 text-ink">{targetType}</span>
      </p>
    </li>
  )
}

export function SchemaDiffCard({ schemaDiff }: SchemaDiffCardProps) {
  if (!schemaDiff) {
    return (
      <Panel className="border-l-2 border-l-line">
        <SectionHeading
          description="Pick a comparison to inspect its schema-level changes."
          eyebrow="Schema diff"
          title="No comparison selected"
          action={<Badge dot tone="muted">No selection</Badge>}
        />
      </Panel>
    )
  }

  const added = schemaDiff.added
  const removed = schemaDiff.removed
  const typeChanges = schemaDiff.type_changes
  const totalChanges = added.length + removed.length + typeChanges.length

  return (
    <Panel>
      <SectionHeading
        description="The backend derives the schema diff from the persisted column lists of the two dataset versions. The frontend never recomputes these changes."
        eyebrow="Schema diff"
        title="Columns"
        action={
          <div className="flex flex-wrap items-center justify-end gap-1">
            <Badge dot tone="success">{added.length} added</Badge>
            <Badge dot tone="danger">{removed.length} removed</Badge>
            <Badge dot tone="warning">{typeChanges.length} type changed</Badge>
          </div>
        }
      />

      {totalChanges === 0 ? (
        <p className="mt-3 rounded-md border border-dashed border-line bg-canvas/30 px-4 py-4 text-sm text-muted">
          The two versions have identical column sets and types. No schema drift was detected.
        </p>
      ) : null}

      {added.length > 0 ? (
        <div className="mt-6">
          <h3 className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted">
            <FilePlus2 aria-hidden="true" size={14} />
            Added columns
          </h3>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {added.map((column) => (
              <Badge dot key={`added-${column}`} tone="success">{column}</Badge>
            ))}
          </div>
        </div>
      ) : null}

      {removed.length > 0 ? (
        <div className="mt-6">
          <h3 className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted">
            <FileX2 aria-hidden="true" size={14} />
            Removed columns
          </h3>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {removed.map((column) => (
              <Badge dot key={`removed-${column}`} tone="danger">{column}</Badge>
            ))}
          </div>
        </div>
      ) : null}

      {typeChanges.length > 0 ? (
        <div className="mt-6">
          <h3 className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted">
            <Columns3 aria-hidden="true" size={14} />
            Type changes
          </h3>
          <ul className="mt-2 overflow-hidden rounded-md border border-line">
            {typeChanges.map((column) => (
              <TypeChangeRow column={column} key={`type-${column.name}`} />
            ))}
          </ul>
        </div>
      ) : null}
    </Panel>
  )
}
