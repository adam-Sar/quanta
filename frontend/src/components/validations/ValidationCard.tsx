import { FileWarning, KeyRound, Sigma, Sparkles } from 'lucide-react'

import type { ValidationResponse, ValidationStatus } from '../../types/api'
import { formatNumber, formatTimestamp } from '../../lib/utils'
import { Badge } from '../ui/Badge'
import { Panel, SectionHeading } from '../ui/Panel'

interface ValidationCardProps {
  validation: ValidationResponse | null
}

const STATUS_TONE: Record<ValidationStatus, 'success' | 'warning' | 'danger'> = {
  valid: 'success',
  warning: 'warning',
  invalid: 'danger',
}

const STATUS_LABEL: Record<ValidationStatus, string> = {
  valid: 'Valid',
  warning: 'Warning',
  invalid: 'Invalid',
}

const SIDE_EFFECT_LABELS: Record<string, string> = {
  column_not_found: 'column not found',
  source_unreadable: 'source file unreadable',
  apply_required: 'apply step required',
  no_dataset_version: 'no dataset version',
}

function formatSideEffect(code: string): string {
  return SIDE_EFFECT_LABELS[code] ?? code.replace(/_/g, ' ')
}

export function ValidationCard({ validation }: ValidationCardProps) {
  if (!validation) {
    return (
      <Panel className="border-l-2 border-l-line">
        <SectionHeading
          description="Select a validation row to inspect the operation, the projected impact, and any unexpected side effects."
          eyebrow="Validation"
          title="Pick a validation"
          action={<Badge dot tone="muted">No selection</Badge>}
        />
      </Panel>
    )
  }

  const { impact, status, formula_version } = validation
  const statusTone = STATUS_TONE[status]
  const statusLabel = STATUS_LABEL[status]

  return (
    <Panel>
      <SectionHeading
        description="The backend runs the deterministic preview engine against the source file and persists a fresh immutable Validation row. The frontend never recomputes impact; it surfaces the backend payload."
        eyebrow="Validation"
        title={validation.title}
        action={
          <div className="flex flex-wrap items-center justify-end gap-1">
            <Badge dot tone={statusTone}>{statusLabel}</Badge>
            <Badge dot tone="muted">{formula_version}</Badge>
          </div>
        }
      />

      <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-md border border-line bg-canvas/30 px-4 py-3.5">
          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted">Status</p>
          <p className="mt-2 text-base font-semibold text-ink">{statusLabel}</p>
          <p className="mt-1 text-xs text-muted">{status === 'valid' ? 'previewed operation is applicable' : status === 'warning' ? 'applicable with caveats' : 'not applicable'}</p>
        </div>
        <div className="rounded-md border border-line bg-canvas/30 px-4 py-3.5">
          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted">Operation</p>
          <p className="mt-2 text-base font-semibold text-ink font-mono">{validation.operation_kind}</p>
          <p className="mt-1 text-xs text-muted">preview-only</p>
        </div>
        <div className="rounded-md border border-line bg-canvas/30 px-4 py-3.5">
          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted">Affected rows</p>
          <p className="mt-2 text-base font-semibold text-ink">{impact.affected_rows === null ? '—' : formatNumber(impact.affected_rows)}</p>
          <p className="mt-1 text-xs text-muted">projected change</p>
        </div>
        <div className="rounded-md border border-line bg-canvas/30 px-4 py-3.5">
          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted">Affected columns</p>
          <p className="mt-2 text-base font-semibold text-ink">{formatNumber(impact.affected_columns.length)}</p>
          <p className="mt-1 text-xs text-muted">from the bounded source frame</p>
        </div>
      </div>

      <div className="mt-6">
        <h3 className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted">
          <Sparkles aria-hidden="true" size={14} />
          Rationale
        </h3>
        <p className="mt-2 text-sm leading-6 text-ink">{validation.rationale}</p>
      </div>

      <div className="mt-6">
        <h3 className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted">
          <Sigma aria-hidden="true" size={14} />
          Impact summary
        </h3>
        <p className="mt-2 text-sm leading-6 text-ink">{impact.summary || 'No summary reported.'}</p>
        {impact.affected_columns.length > 0 ? (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {impact.affected_columns.map((column) => (
              <Badge dot key={`${validation.validation_id}-${column}`} tone="muted">{column}</Badge>
            ))}
          </div>
        ) : null}
      </div>

      {impact.unexpected_side_effects.length > 0 ? (
        <div className="mt-6 rounded-md border border-warning/30 bg-warning/5 p-4">
          <div className="flex items-center gap-2 text-warning">
            <FileWarning aria-hidden="true" size={14} />
            <h3 className="text-[10px] font-semibold uppercase tracking-[0.14em]">Unexpected side effects</h3>
            <Badge dot tone="warning">{impact.unexpected_side_effects.length}</Badge>
          </div>
          <ul className="mt-2 space-y-1 text-sm text-muted">
            {impact.unexpected_side_effects.map((code) => (
              <li key={`${validation.validation_id}-${code}`}>· {formatSideEffect(code)}</li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="mt-6 flex items-center gap-2 border-t border-line pt-4 text-xs text-muted">
        <KeyRound aria-hidden="true" size={14} />
        <span>Validation id <span className="font-mono text-ink/80">{validation.validation_id.slice(0, 8)}</span></span>
        <span aria-hidden="true">·</span>
        <span>Created {formatTimestamp(validation.created_at)}</span>
      </div>
    </Panel>
  )
}
