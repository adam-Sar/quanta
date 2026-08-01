import { Brain, Cpu, FileText, KeyRound } from 'lucide-react'

import type { AIInterpretationResponse } from '../../types/api'
import { formatNumber, formatTimestamp } from '../../lib/utils'
import { Badge } from '../ui/Badge'
import { Panel, SectionHeading } from '../ui/Panel'
import { cn } from '../../lib/utils'

interface InterpretationCardProps {
  interpretation: AIInterpretationResponse | null
}

function confidenceTone(confidence: number): 'success' | 'warning' | 'danger' | 'muted' {
  if (confidence >= 0.75) return 'success'
  if (confidence >= 0.4) return 'warning'
  if (confidence > 0) return 'danger'
  return 'muted'
}

function confidenceLabel(confidence: number): string {
  if (confidence >= 0.75) return 'High confidence'
  if (confidence >= 0.4) return 'Medium confidence'
  if (confidence > 0) return 'Low confidence'
  return 'No confidence'
}

export function InterpretationCard({ interpretation }: InterpretationCardProps) {
  if (!interpretation) {
    return (
      <Panel className="border-l-2 border-l-line">
        <SectionHeading
          description="Select an interpretation to inspect its summary, hypotheses, and provider metadata."
          eyebrow="Interpretation"
          title="Pick an interpretation"
          action={<Badge dot tone="muted">No selection</Badge>}
        />
      </Panel>
    )
  }

  const tone = confidenceTone(interpretation.overall_confidence)

  return (
    <Panel>
      <SectionHeading
        description="The backend persists the summary, overall confidence, and the JSONB hypotheses payload on every run. The frontend never recomputes them."
        eyebrow="Interpretation"
        title={interpretation.provider_name}
        action={
          <div className="flex flex-wrap items-center justify-end gap-1">
            <Badge dot tone={tone}>
              {confidenceLabel(interpretation.overall_confidence)} · {(interpretation.overall_confidence * 100).toFixed(0)}%
            </Badge>
            <Badge dot tone="muted">{interpretation.formula_version}</Badge>
          </div>
        }
      />

      <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <div className={cn('rounded-md border border-line bg-canvas/30 px-4 py-3.5')}>
          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted">Provider</p>
          <p className="mt-2 text-base font-semibold text-ink">
            <span className="font-mono">{interpretation.provider_name}</span>
          </p>
          <p className="mt-1 text-xs text-muted">model <span className="font-mono text-ink/80">{interpretation.model_name}</span></p>
        </div>
        <div className="rounded-md border border-line bg-canvas/30 px-4 py-3.5">
          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted">Overall confidence</p>
          <p className="mt-2 text-base font-semibold text-ink">
            <span className="font-mono">{(interpretation.overall_confidence * 100).toFixed(0)}%</span>
          </p>
          <p className="mt-1 text-xs text-muted">{confidenceLabel(interpretation.overall_confidence)}</p>
        </div>
        <div className="rounded-md border border-line bg-canvas/30 px-4 py-3.5">
          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted">Hypotheses</p>
          <p className="mt-2 text-base font-semibold text-ink">
            <span className="font-mono">{formatNumber(interpretation.hypotheses.length)}</span>
          </p>
          <p className="mt-1 text-xs text-muted">structured JSONB entries</p>
        </div>
        <div className="rounded-md border border-line bg-canvas/30 px-4 py-3.5">
          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted">Input findings</p>
          <p className="mt-2 text-base font-semibold text-ink">
            <span className="font-mono">{formatNumber(interpretation.input_finding_ids.length)}</span>
          </p>
          <p className="mt-1 text-xs text-muted">consumed by the reasoning layer</p>
        </div>
      </div>

      <div className="mt-6">
        <h3 className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted">
          <FileText aria-hidden="true" size={14} />
          Summary
        </h3>
        <p className="mt-2 whitespace-pre-line text-sm leading-6 text-ink">{interpretation.summary}</p>
      </div>

      {interpretation.hypotheses.length > 0 ? (
        <div className="mt-6">
          <h3 className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted">
            <Brain aria-hidden="true" size={14} />
            Hypotheses ({formatNumber(interpretation.hypotheses.length)})
          </h3>
          <ol className="mt-2 space-y-2">
            {interpretation.hypotheses.map((hypothesis, index) => (
              <li
                className="rounded-md border border-line bg-canvas/30 px-4 py-3"
                key={`${interpretation.interpretation_id}-${hypothesis.category}-${index}`}
              >
                <p className="flex flex-wrap items-center gap-2 text-xs">
                  <Badge dot tone="muted">{hypothesis.category.replace('_', ' ')}</Badge>
                  <Badge dot tone={confidenceTone(hypothesis.confidence)}>
                    {(hypothesis.confidence * 100).toFixed(0)}% confidence
                  </Badge>
                </p>
                <p className="mt-2 text-sm leading-6 text-ink">{hypothesis.summary}</p>
                {hypothesis.affected_columns.length > 0 ? (
                  <p className="mt-2 text-[11px] text-muted">
                    Columns: {hypothesis.affected_columns.map((column) => <span className="font-mono text-ink/80" key={column}>{` ${column} `}</span>)}
                  </p>
                ) : null}
                {hypothesis.supporting_finding_ids.length > 0 ? (
                  <p className="mt-1 text-[11px] text-muted">
                    Supporting findings: {hypothesis.supporting_finding_ids.map((id) => <span className="font-mono text-ink/80" key={id}>{` ${id.slice(0, 8)}`}</span>)}
                  </p>
                ) : null}
              </li>
            ))}
          </ol>
        </div>
      ) : null}

      <div className="mt-6 flex items-center gap-2 border-t border-line pt-4 text-xs text-muted">
        <KeyRound aria-hidden="true" size={14} />
        <span>Interpretation id <span className="font-mono text-ink/80">{interpretation.interpretation_id.slice(0, 8)}</span></span>
        <span aria-hidden="true">·</span>
        <span>Profile <span className="font-mono text-ink/80">{interpretation.profile_id.slice(0, 8)}</span></span>
        <span aria-hidden="true">·</span>
        <span>Created {formatTimestamp(interpretation.created_at)}</span>
      </div>

      <div className="mt-3 flex items-center gap-2 text-xs text-muted">
        <Cpu aria-hidden="true" size={14} />
        <span>The AI reasoning layer is strictly advisory; it never mutates the source file, profile, score, or finding rows. Task 8 (Recommendations) may optionally record this interpretation id inside a recommendation's components payload.</span>
      </div>
    </Panel>
  )
}
