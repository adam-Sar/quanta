import {
  Activity,
  CheckCircle2,
  CircleAlert,
  Database,
  Gauge,
  History,
  ShieldCheck,
} from 'lucide-react'
import { useQuery } from '@tanstack/react-query'

import { getHealth, getReadiness } from '../api/health'
import { ApiError } from '../api/client'
import { cn, formatTimestamp } from '../lib/utils'
import { Badge } from '../components/ui/Badge'
import { EmptyState } from '../components/ui/EmptyState'
import { ErrorState } from '../components/ui/ErrorState'
import { LoadingSkeleton } from '../components/ui/LoadingSkeleton'
import { Metric } from '../components/ui/Metric'
import { PageHeader } from '../components/ui/PageHeader'
import { Panel, SectionHeading } from '../components/ui/Panel'

function StatusRow({
  label,
  detail,
  state,
  timestamp,
}: {
  label: string
  detail: string
  state: 'ready' | 'checking' | 'degraded'
  timestamp?: string
}) {
  const tone = state === 'ready' ? 'success' : state === 'degraded' ? 'warning' : 'muted'
  const text = state === 'ready' ? 'Ready' : state === 'degraded' ? 'Unavailable' : 'Checking'
  const Icon = state === 'ready' ? CheckCircle2 : state === 'degraded' ? CircleAlert : Activity

  return (
    <div className="flex items-center justify-between gap-4 border-b border-line py-3.5 last:border-b-0 last:pb-0 first:pt-0">
      <div className="flex min-w-0 items-center gap-3">
        <Icon aria-hidden="true" className={state === 'ready' ? 'text-success' : state === 'degraded' ? 'text-warning' : 'text-muted'} size={17} strokeWidth={1.8} />
        <div className="min-w-0">
          <p className="text-sm font-medium text-ink">{label}</p>
          <p className="mt-0.5 truncate text-xs text-muted">{detail}</p>
        </div>
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1">
        <Badge tone={tone}>{text}</Badge>
        {timestamp ? <span className="text-[10px] text-muted">{formatTimestamp(timestamp)}</span> : null}
      </div>
    </div>
  )
}

const pipelineIconClasses = {
  success: 'bg-success/10 text-success',
  accent: 'bg-accent/10 text-accent',
  info: 'bg-info/10 text-info',
  warning: 'bg-warning/10 text-warning',
}

const pipelineStages = [
  {
    title: 'Ingestion',
    detail: 'Immutable CSV and Parquet source versions',
    icon: Database,
    tone: 'success' as const,
  },
  {
    title: 'Deterministic profiling',
    detail: 'Bounded column metrics and type-aware statistics',
    icon: Gauge,
    tone: 'accent' as const,
  },
  {
    title: 'Findings and score',
    detail: 'Threshold-driven detectors with an explainable grade',
    icon: ShieldCheck,
    tone: 'info' as const,
  },
  {
    title: 'AI interpretation',
    detail: 'Advisory hypotheses tied back to objective findings',
    icon: Activity,
    tone: 'warning' as const,
  },
]

export function OverviewPage() {
  const healthQuery = useQuery({
    queryKey: ['health', 'liveness'],
    queryFn: getHealth,
    staleTime: 30_000,
    retry: 1,
  })
  const readinessQuery = useQuery({
    queryKey: ['health', 'readiness'],
    queryFn: getReadiness,
    refetchInterval: 30_000,
    retry: 1,
    staleTime: 10_000,
  })

  const healthError = healthQuery.error instanceof ApiError ? healthQuery.error : null
  const readinessError = readinessQuery.error instanceof ApiError ? readinessQuery.error : null
  const readinessState = readinessQuery.isSuccess ? 'ready' : readinessQuery.isError ? 'degraded' : 'checking'

  return (
    <div className="space-y-8">
      <PageHeader
        description="A focused control plane for understanding data health, evidence, and safe next actions."
        eyebrow="Control plane"
        title="Overview"
        action={<Badge dot tone={readinessState === 'ready' ? 'success' : readinessState === 'degraded' ? 'warning' : 'muted'}>{readinessState === 'ready' ? 'System operational' : readinessState === 'degraded' ? 'Connection issue' : 'Checking services'}</Badge>}
      />

      <section className="grid gap-4 xl:grid-cols-[1.35fr_1fr]">
        <Panel className="border-l-2 border-l-accent">
          <div className="flex flex-col justify-between gap-7 sm:flex-row sm:items-start">
            <div className="max-w-xl">
              <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-accent">Foundation / task 01</p>
              <h2 className="mt-3 text-xl font-semibold tracking-tight text-ink">Reliability work starts with an honest signal.</h2>
              <p className="mt-3 text-sm leading-6 text-muted">
                Quanta separates measured evidence from interpretation. The application shell is connected to the backend and ready for the dataset explorer to land next.
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-3 rounded-md border border-line bg-canvas/35 px-3 py-2.5">
              <span className="flex h-8 w-8 items-center justify-center rounded bg-accent/10 text-accent">
                <ShieldCheck aria-hidden="true" size={17} strokeWidth={1.7} />
              </span>
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted">Operating model</p>
                <p className="mt-1 text-xs font-medium text-ink">Evidence first</p>
              </div>
            </div>
          </div>
          <div className="mt-7 grid gap-3 sm:grid-cols-3">
            <Metric detail="FastAPI contract" icon={Activity} label="Transport" tone="accent" value="Connected" />
            <Metric detail="No client-side scoring" icon={ShieldCheck} label="Authority" tone="success" value="Backend" />
            <Metric detail="Preview-only by design" icon={History} label="Actions" tone="warning" value="Auditable" />
          </div>
        </Panel>

        <Panel>
          <SectionHeading description="Live liveness and database checks from the running API." title="Service status" />
          <div className="mt-6">
            {healthQuery.isPending ? <LoadingSkeleton lines={2} /> : null}
            {healthQuery.isError ? (
              <ErrorState
                className="border-0 bg-transparent p-0"
                message={healthError?.message ?? 'The liveness check could not be completed.'}
                onRetry={() => void healthQuery.refetch()}
                requestId={healthError?.requestId}
                title="Liveness check failed"
              />
            ) : null}
            {!healthQuery.isPending && !healthQuery.isError ? (
              <div className="space-y-3">
                <StatusRow
                  detail={healthQuery.data.service}
                  state="ready"
                  timestamp={healthQuery.data.timestamp}
                  label="Process liveness"
                />
                <StatusRow
                  detail={readinessQuery.isSuccess ? 'PostgreSQL connection available' : readinessError?.message ?? 'Waiting for readiness response'}
                  state={readinessState}
                  timestamp={readinessQuery.data?.timestamp}
                  label="Infrastructure readiness"
                />
              </div>
            ) : null}
          </div>
        </Panel>
      </section>

      <section className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
        <Panel>
          <SectionHeading
            description="The backend resources that will feed the reliability workflow."
            eyebrow="Signal pipeline"
            title="From source to decision"
          />
          <div className="mt-6 divide-y divide-line">
            {pipelineStages.map(({ title, detail, icon: Icon, tone }) => (
              <div className="flex items-center gap-4 py-4 first:pt-0 last:pb-0" key={title}>
                <span className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-line', pipelineIconClasses[tone])}>
                  <Icon aria-hidden="true" size={17} strokeWidth={1.7} />
                </span>
                <div className="min-w-0">
                  <p className="text-sm font-medium text-ink">{title}</p>
                  <p className="mt-1 text-xs leading-5 text-muted">{detail}</p>
                </div>
                <Badge className="ml-auto shrink-0" tone={tone === 'warning' ? 'warning' : tone === 'info' ? 'info' : 'success'}>API ready</Badge>
              </div>
            ))}
          </div>
        </Panel>

        <Panel>
          <SectionHeading description="No dataset data is requested until the explorer task is enabled." title="Workspace state" />
          <div className="mt-6">
            <EmptyState
              icon={Database}
              title="Dataset inventory is not connected yet"
              description="Task 2 will connect the paginated dataset list and multipart ingestion flow without adding client-side assumptions."
            />
          </div>
        </Panel>
      </section>
    </div>
  )
}
