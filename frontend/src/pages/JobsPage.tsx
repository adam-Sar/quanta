import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { Briefcase } from 'lucide-react'

import { listGlobalJobs } from '../api/analysis'
import { getHealth, getReadiness } from '../api/health'
import { ApiError } from '../api/client'
import { Badge } from '../components/ui/Badge'
import { ErrorState } from '../components/ui/ErrorState'
import { LoadingSkeleton } from '../components/ui/LoadingSkeleton'
import { PageHeader } from '../components/ui/PageHeader'
import { Panel, SectionHeading } from '../components/ui/Panel'
import { formatNumber, formatTimestamp } from '../lib/utils'

export function JobsPage() {
  const healthQuery = useQuery({ queryKey: ['health', 'liveness'], queryFn: getHealth, staleTime: 30_000 })
  const readinessQuery = useQuery({
    queryKey: ['health', 'readiness'],
    queryFn: getReadiness,
    refetchInterval: 30_000,
    retry: 1,
  })

  const jobsQuery = useQuery({
    queryKey: ['jobs', 'global'],
    queryFn: () => listGlobalJobs(),
    refetchInterval: 30_000,
    retry: 1,
  })

  return (
    <div className="space-y-6">
      <PageHeader
        description="Every durable analysis run recorded across the workspace. Jobs are persisted with a status lifecycle (pending → running → succeeded | failed). Per-dataset Jobs tabs are reachable from each dataset's page."
        title="Jobs"
      />

      <Panel>
        <SectionHeading
          description="The current state of the backend job runner. Live liveness + database readiness, refreshed every 30 seconds."
          eyebrow="Service"
          title="Backend health"
        />
        <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          <ServiceTile
            label="Process liveness"
            detail={healthQuery.data ? `${healthQuery.data.service} · ${healthQuery.data.version}` : '—'}
            tone={healthQuery.isSuccess ? 'success' : healthQuery.isError ? 'danger' : 'muted'}
          />
          <ServiceTile
            label="Database readiness"
            detail={readinessQuery.data ? 'Connected' : readinessQuery.isError ? 'Unavailable' : '—'}
            tone={readinessQuery.isSuccess ? 'success' : readinessQuery.isError ? 'warning' : 'muted'}
          />
          <ServiceTile
            label="Last check"
            detail={
              healthQuery.data
                ? formatTimestamp(healthQuery.data.timestamp)
                : readinessQuery.data
                  ? formatTimestamp(readinessQuery.data.timestamp)
                  : '—'
            }
            tone="muted"
          />
        </div>
      </Panel>

      <Panel padded={false}>
        <div className="flex items-start justify-between gap-4 border-b border-line px-5 py-5 md:px-6">
          <SectionHeading
            description="The most recent durable jobs across all datasets. Click a row to open the dataset detail page."
            eyebrow="Activity"
            title="Recent jobs"
          />
          {jobsQuery.data ? (
            <span className="shrink-0 text-[11px] text-muted">
              {formatNumber(jobsQuery.data.length)} job
              {jobsQuery.data.length === 1 ? '' : 's'}
            </span>
          ) : null}
        </div>
        <div className="p-5 md:p-6">
          {jobsQuery.isPending ? (
            <LoadingSkeleton lines={4} />
          ) : jobsQuery.isError ? (
            <ErrorState
              message={
                jobsQuery.error instanceof ApiError
                  ? jobsQuery.error.message
                  : 'The workspace jobs feed could not be loaded.'
              }
              onRetry={() => void jobsQuery.refetch()}
              requestId={jobsQuery.error instanceof ApiError ? jobsQuery.error.requestId : null}
              title="Jobs feed failed"
            />
          ) : jobsQuery.data.length === 0 ? (
            <div className="rounded-md border border-dashed border-line bg-canvas px-4 py-8 text-center text-sm text-muted">
              <Briefcase aria-hidden="true" className="mx-auto mb-2 text-muted" size={20} />
              No durable jobs have been recorded yet. Trigger a profile, detection, or
              comparison run on any dataset to populate this feed.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-[760px] w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-line text-[10px] uppercase tracking-[0.12em] text-muted">
                    <th className="px-3 py-2 font-semibold">Job</th>
                    <th className="px-3 py-2 font-semibold">Kind</th>
                    <th className="px-3 py-2 font-semibold">Status</th>
                    <th className="px-3 py-2 font-semibold">Dataset</th>
                    <th className="px-3 py-2 font-semibold text-right">Created</th>
                  </tr>
                </thead>
                <tbody>
                  {jobsQuery.data.map((job) => (
                    <tr
                      className="border-b border-line/70 last:border-b-0 hover:bg-canvas"
                      key={`${job.dataset_id}-${job.job_id}`}
                    >
                      <td className="px-3 py-2 font-mono text-muted">
                        {job.job_id.slice(0, 8)}
                      </td>
                      <td className="px-3 py-2 font-mono text-ink-soft">{job.kind}</td>
                      <td className="px-3 py-2">
                        <Badge
                          dot
                          tone={
                            job.status === 'succeeded'
                              ? 'success'
                              : job.status === 'failed'
                                ? 'danger'
                                : job.status === 'running'
                                  ? 'warning'
                                  : 'muted'
                          }
                        >
                          {job.status}
                        </Badge>
                      </td>
                      <td className="px-3 py-2">
                        <Link
                          className="text-accent hover:underline"
                          to={`/datasets/${job.dataset_id}/jobs`}
                        >
                          {job.dataset_id.slice(0, 8)}
                        </Link>
                      </td>
                      <td className="px-3 py-2 text-right text-xs text-muted">
                        {formatTimestamp(job.created_at)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </Panel>
    </div>
  )
}

interface ServiceTileProps {
  label: string
  detail: string
  tone: 'success' | 'warning' | 'danger' | 'muted'
}

const TONE_DOT: Record<ServiceTileProps['tone'], string> = {
  success: 'bg-emerald-500',
  warning: 'bg-amber-500',
  danger: 'bg-rose-500',
  muted: 'bg-slate-300',
}

function ServiceTile({ label, detail, tone }: ServiceTileProps) {
  return (
    <div className="rounded-md border border-line bg-surface px-4 py-3.5">
      <div className="flex items-center gap-2">
        <span
          aria-hidden="true"
          className={`h-1.5 w-1.5 rounded-full ${TONE_DOT[tone]}`}
        />
        <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted">{label}</p>
      </div>
      <p className="mt-2 text-sm font-medium text-ink">{detail}</p>
    </div>
  )
}

