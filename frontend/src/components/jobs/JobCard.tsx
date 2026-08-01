import { ChevronRight, KeyRound, Sigma, Sparkles } from 'lucide-react'

import type { JobResponse, JobStatus } from '../../types/api'
import { formatTimestamp } from '../../lib/utils'
import { Badge } from '../ui/Badge'
import { Panel, SectionHeading } from '../ui/Panel'

interface JobCardProps {
  job: JobResponse | null
}

const STATUS_TONE: Record<JobStatus, 'success' | 'warning' | 'danger' | 'muted'> = {
  succeeded: 'success',
  running: 'warning',
  pending: 'muted',
  failed: 'danger',
}

const STATUS_LABEL: Record<JobStatus, string> = {
  succeeded: 'Succeeded',
  running: 'Running',
  pending: 'Pending',
  failed: 'Failed',
}

const KIND_LABEL: Record<string, string> = {
  profile: 'Profile',
  detect: 'Detection',
  score: 'Score',
  history: 'History',
  recommendations: 'Recommendations',
  validations: 'Validation',
}

function formatDuration(started: string | null, completed: string | null): string {
  if (!started) return '—'
  const start = new Date(started).getTime()
  const end = completed ? new Date(completed).getTime() : Date.now()
  const ms = Math.max(0, end - start)
  if (ms < 1000) return `${ms} ms`
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)} s`
  return `${(ms / 60_000).toFixed(1)} min`
}

function summarizeResult(result: Record<string, unknown>): { label: string; value: string }[] {
  const summary: { label: string; value: string }[] = []
  if ('profile_id' in result) {
    summary.push({ label: 'Profile id', value: String(result.profile_id).slice(0, 12) })
  }
  if ('finding_count' in result) {
    summary.push({ label: 'Finding count', value: String(result.finding_count) })
  }
  if ('finding_ids' in result && Array.isArray(result.finding_ids)) {
    summary.push({ label: 'Finding ids', value: String((result.finding_ids as string[]).length) })
  }
  if ('score_id' in result) {
    summary.push({ label: 'Score id', value: String(result.score_id).slice(0, 12) })
    summary.push({ label: 'Score', value: `${result.score} (grade ${result.grade})` })
  }
  if ('comparison_id' in result) {
    summary.push({ label: 'Comparison id', value: String(result.comparison_id).slice(0, 12) })
    summary.push({ label: 'Has drift', value: String(result.has_drift) })
  }
  if ('count' in result) {
    summary.push({ label: 'Count', value: String(result.count) })
  }
  if ('recommendation_ids' in result && Array.isArray(result.recommendation_ids)) {
    summary.push({ label: 'Recommendation ids', value: String((result.recommendation_ids as string[]).length) })
  }
  if ('validation_id' in result) {
    summary.push({ label: 'Validation id', value: String(result.validation_id).slice(0, 12) })
    summary.push({ label: 'Recommendation id', value: String(result.recommendation_id).slice(0, 12) })
    summary.push({ label: 'Operation', value: String(result.operation_kind) })
  }
  return summary
}

export function JobCard({ job }: JobCardProps) {
  if (!job) {
    return (
      <Panel className="border-l-2 border-l-line">
        <SectionHeading
          description="Select a job to inspect its lifecycle, structured result, and any failure envelope."
          eyebrow="Job"
          title="Pick a job"
          action={<Badge dot tone="muted">No selection</Badge>}
        />
      </Panel>
    )
  }

  const tone = STATUS_TONE[job.status]
  const statusLabel = STATUS_LABEL[job.status]
  const kindLabel = KIND_LABEL[job.kind] ?? job.kind
  const resultSummary = summarizeResult(job.result)
  const errorMessage = typeof job.error.message === 'string' ? job.error.message : null
  const errorCode = typeof job.error.code === 'string' ? job.error.code : null

  return (
    <Panel>
      <SectionHeading
        description="The backend runs the wrapped service method synchronously and persists a fresh immutable Job row with the structured outcome. The frontend never recomputes priority, status, or the result payload."
        eyebrow="Job"
        title={job.title}
        action={
          <div className="flex flex-wrap items-center justify-end gap-1">
            <Badge dot tone={tone}>{statusLabel}</Badge>
            <Badge dot tone="muted">{kindLabel}</Badge>
            <Badge dot tone="muted">{job.formula_version}</Badge>
          </div>
        }
      />

      <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-md border border-line bg-canvas/30 px-4 py-3.5">
          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted">Kind</p>
          <p className="mt-2 text-base font-semibold text-ink font-mono">{job.kind}</p>
          <p className="mt-1 text-xs text-muted">deterministic, synchronous</p>
        </div>
        <div className="rounded-md border border-line bg-canvas/30 px-4 py-3.5">
          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted">Created</p>
          <p className="mt-2 text-base font-semibold text-ink">{formatTimestamp(job.created_at)}</p>
          <p className="mt-1 text-xs text-muted">status start</p>
        </div>
        <div className="rounded-md border border-line bg-canvas/30 px-4 py-3.5">
          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted">Started</p>
          <p className="mt-2 text-base font-semibold text-ink">{job.started_at ? formatTimestamp(job.started_at) : '—'}</p>
          <p className="mt-1 text-xs text-muted">worker dispatch</p>
        </div>
        <div className="rounded-md border border-line bg-canvas/30 px-4 py-3.5">
          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted">Completed</p>
          <p className="mt-2 text-base font-semibold text-ink">{job.completed_at ? formatTimestamp(job.completed_at) : '—'}</p>
          <p className="mt-1 text-xs text-muted">{job.started_at ? `${formatDuration(job.started_at, job.completed_at)} wall clock` : 'not yet completed'}</p>
        </div>
      </div>

      {resultSummary.length > 0 ? (
        <div className="mt-6">
          <h3 className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted">
            <Sigma aria-hidden="true" size={14} />
            Structured result
          </h3>
          <ul className="mt-2 space-y-1 text-sm text-ink">
            {resultSummary.map(({ label, value }) => (
              <li key={`${job.job_id}-${label}`} className="flex items-center gap-3 rounded-md border border-line bg-canvas/20 px-3 py-1.5">
                <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted w-44 shrink-0">{label}</span>
                <ChevronRight aria-hidden="true" className="text-muted/60" size={12} />
                <span className="font-mono text-xs">{value}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {job.status === 'failed' && (errorMessage || errorCode) ? (
        <div className="mt-6 rounded-md border border-danger/30 bg-danger/5 p-4">
          <div className="flex items-center gap-2 text-danger">
            <Sparkles aria-hidden="true" size={14} />
            <h3 className="text-[10px] font-semibold uppercase tracking-[0.14em]">Failure envelope</h3>
          </div>
          <p className="mt-2 text-sm text-ink">{errorMessage ?? 'No message reported.'}</p>
          {errorCode ? (
            <p className="mt-1 font-mono text-[11px] text-muted">code: {errorCode}</p>
          ) : null}
        </div>
      ) : null}

      <div className="mt-6 flex items-center gap-2 border-t border-line pt-4 text-xs text-muted">
        <KeyRound aria-hidden="true" size={14} />
        <span>Job id <span className="font-mono text-ink/80">{job.job_id.slice(0, 8)}</span></span>
        <span aria-hidden="true">·</span>
        <span>Formula <span className="font-mono text-ink/80">{job.formula_version}</span></span>
        {job.profile_id ? (
          <>
            <span aria-hidden="true">·</span>
            <span>Profile <span className="font-mono text-ink/80">{job.profile_id.slice(0, 8)}</span></span>
          </>
        ) : null}
      </div>
    </Panel>
  )
}
