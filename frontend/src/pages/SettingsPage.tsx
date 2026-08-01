import { useQuery } from '@tanstack/react-query'
import { Settings as SettingsIcon } from 'lucide-react'

import { getHealth, getLimits, getMetrics, getReadiness } from '../api/health'
import { ApiError } from '../api/client'
import { ErrorState } from '../components/ui/ErrorState'
import { LoadingSkeleton } from '../components/ui/LoadingSkeleton'
import { PageHeader } from '../components/ui/PageHeader'
import { Panel, SectionHeading } from '../components/ui/Panel'
import { formatNumber, formatTimestamp } from '../lib/utils'

export function SettingsPage() {
  const healthQuery = useQuery({ queryKey: ['health', 'liveness'], queryFn: getHealth, staleTime: 30_000 })
  const readinessQuery = useQuery({
    queryKey: ['health', 'readiness'],
    queryFn: getReadiness,
    refetchInterval: 30_000,
    retry: 1,
  })
  const limitsQuery = useQuery({ queryKey: ['ops', 'limits'], queryFn: getLimits, retry: 1 })
  const metricsQuery = useQuery({ queryKey: ['ops', 'metrics'], queryFn: getMetrics, retry: 1 })

  return (
    <div className="space-y-6">
      <PageHeader
        description="Runtime configuration and live observability for the workspace. Liveness, readiness, limits, and metrics are read directly from the backend; nothing here is mocked or hard-coded."
        title="Settings"
      />

      <Panel>
        <SectionHeading
          description="Quanta's public liveness + readiness endpoints. The sidebar status dot mirrors the same signal."
          eyebrow="Service"
          title="Liveness and readiness"
        />
        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          <StatusTile
            label="Process liveness"
            value={healthQuery.data ? `${healthQuery.data.service} · ${healthQuery.data.version}` : '—'}
            detail={
              healthQuery.data
                ? `Environment ${healthQuery.data.environment}`
                : healthQuery.isError
                  ? (healthQuery.error instanceof ApiError ? healthQuery.error.message : 'Liveness check failed')
                  : 'Checking…'
            }
            tone={healthQuery.isSuccess ? 'success' : healthQuery.isError ? 'danger' : 'muted'}
          />
          <StatusTile
            label="Database readiness"
            value={readinessQuery.data ? 'Connected' : '—'}
            detail={
              readinessQuery.data
                ? `Last check ${formatTimestamp(readinessQuery.data.timestamp)}`
                : readinessQuery.isError
                  ? (readinessQuery.error instanceof ApiError ? readinessQuery.error.message : 'Readiness check failed')
                  : 'Checking…'
            }
            tone={readinessQuery.isSuccess ? 'success' : readinessQuery.isError ? 'warning' : 'muted'}
          />
        </div>
      </Panel>

      <Panel>
        <SectionHeading
          description="The hard limits Quanta enforces on the API surface. Values come from the live /limits endpoint."
          eyebrow="Runtime"
          title="API limits"
        />
        {limitsQuery.isPending ? (
          <div className="mt-5">
            <LoadingSkeleton lines={4} />
          </div>
        ) : limitsQuery.isError ? (
          <div className="mt-5">
            <ErrorState
              message={
                limitsQuery.error instanceof ApiError
                  ? limitsQuery.error.message
                  : 'The /limits endpoint could not be reached.'
              }
              onRetry={() => void limitsQuery.refetch()}
              requestId={limitsQuery.error instanceof ApiError ? limitsQuery.error.requestId : null}
              title="Limits unavailable"
            />
          </div>
        ) : limitsQuery.data ? (
          <dl className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            <LimitRow
              label="Rate limit"
              value={`${limitsQuery.data.rate_limit_capacity} req / ${limitsQuery.data.rate_limit_window_seconds}s`}
            />
            <LimitRow
              label="Max request bytes"
              value={formatBytes(limitsQuery.data.max_request_bytes)}
            />
            <LimitRow
              label="Max upload size"
              value={formatBytes(limitsQuery.data.max_upload_size_bytes)}
            />
            <LimitRow label="Request budget" value={`${limitsQuery.data.request_budget_ms} ms`} />
            <LimitRow
              label="Metrics buffer"
              value={`${limitsQuery.data.metrics_buffer_capacity} entries`}
            />
          </dl>
        ) : null}
      </Panel>

      <Panel>
        <SectionHeading
          description="Live /metrics snapshot: the summary counters, the most recent observed requests, and the current buffer fill."
          eyebrow="Observability"
          title="Metrics"
        />
        {metricsQuery.isPending ? (
          <div className="mt-5">
            <LoadingSkeleton lines={4} />
          </div>
        ) : metricsQuery.isError ? (
          <div className="mt-5">
            <ErrorState
              message={
                metricsQuery.error instanceof ApiError
                  ? metricsQuery.error.message
                  : 'The /metrics endpoint could not be reached.'
              }
              onRetry={() => void metricsQuery.refetch()}
              requestId={metricsQuery.error instanceof ApiError ? metricsQuery.error.requestId : null}
              title="Metrics unavailable"
            />
          </div>
        ) : metricsQuery.data ? (
          <div className="mt-5 space-y-5">
            <SummaryGroup metrics={metricsQuery.data} />
            <ByStatusGroup metrics={metricsQuery.data} />
            <ByPathGroup metrics={metricsQuery.data} />
            <RecentGroup metrics={metricsQuery.data} />
          </div>
        ) : null}
      </Panel>

      <Panel>
        <SectionHeading
          description="Visual identity and product surface. Read-only; per-workspace overrides would live in a future release."
          eyebrow="Brand"
          title="About Quanta"
        />
        <div className="mt-5 flex items-start gap-4">
          <span className="flex h-10 w-10 items-center justify-center rounded-md bg-accent-tint text-accent">
            <SettingsIcon aria-hidden="true" size={18} />
          </span>
          <div>
            <p className="text-sm font-medium text-ink">Quanta Data Reliability</p>
            <p className="mt-1 text-xs text-ink-soft">
              v{healthQuery.data?.version ?? '—'} · environment {healthQuery.data?.environment ?? '—'}
            </p>
            <p className="mt-2 text-xs text-muted">
              Light mode, sky-blue accent. Brand and color tokens can be re-themed from
              <code className="mx-1 rounded bg-canvas px-1.5 py-0.5 font-mono text-ink-soft">
                frontend/src/index.css
              </code>
              and
              <code className="mx-1 rounded bg-canvas px-1.5 py-0.5 font-mono text-ink-soft">
                tailwind.config.ts
              </code>
              .
            </p>
          </div>
        </div>
      </Panel>
    </div>
  )
}

function formatBytes(value: number): string {
  if (value < 1024) return `${value} B`
  if (value < 1024 ** 2) return `${(value / 1024).toFixed(1)} KB`
  if (value < 1024 ** 3) return `${(value / 1024 ** 2).toFixed(1)} MB`
  return `${(value / 1024 ** 3).toFixed(1)} GB`
}

interface StatusTileProps {
  label: string
  value: string
  detail: string
  tone: 'success' | 'warning' | 'danger' | 'muted'
}

const TONE_DOT: Record<StatusTileProps['tone'], string> = {
  success: 'bg-emerald-500',
  warning: 'bg-amber-500',
  danger: 'bg-rose-500',
  muted: 'bg-slate-300',
}

function StatusTile({ label, value, detail, tone }: StatusTileProps) {
  return (
    <div className="rounded-md border border-line bg-surface px-4 py-3.5">
      <div className="flex items-center gap-2">
        <span aria-hidden="true" className={`h-1.5 w-1.5 rounded-full ${TONE_DOT[tone]}`} />
        <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted">{label}</p>
      </div>
      <p className="mt-2 text-base font-semibold text-ink">{value}</p>
      <p className="mt-1 text-xs text-muted">{detail}</p>
    </div>
  )
}

function LimitRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-line bg-canvas px-4 py-3">
      <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted">{label}</p>
      <p className="mt-1 text-sm font-medium tabular-nums text-ink">{value}</p>
    </div>
  )
}

interface MetricsGroup {
  metrics: import('../api/health').MetricsResponse
}

function SummaryGroup({ metrics }: MetricsGroup) {
  return (
    <div>
      <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted">Summary</p>
      <ul className="mt-2 divide-y divide-line rounded-md border border-line bg-canvas">
        <li className="flex items-center justify-between px-4 py-2 text-sm">
          <span className="text-ink-soft">Total requests</span>
          <span className="font-mono tabular-nums text-ink">{formatNumber(metrics.summary.total_requests)}</span>
        </li>
        <li className="flex items-center justify-between px-4 py-2 text-sm">
          <span className="text-ink-soft">Average latency</span>
          <span className="font-mono tabular-nums text-ink">{metrics.summary.average_ms.toFixed(2)} ms</span>
        </li>
        <li className="flex items-center justify-between px-4 py-2 text-sm">
          <span className="text-ink-soft">Min latency</span>
          <span className="font-mono tabular-nums text-ink">{metrics.summary.min_ms.toFixed(2)} ms</span>
        </li>
        <li className="flex items-center justify-between px-4 py-2 text-sm">
          <span className="text-ink-soft">Max latency</span>
          <span className="font-mono tabular-nums text-ink">{metrics.summary.max_ms.toFixed(2)} ms</span>
        </li>
        <li className="flex items-center justify-between px-4 py-2 text-sm">
          <span className="text-ink-soft">Buffer</span>
          <span className="font-mono tabular-nums text-ink">
            {formatNumber(metrics.size)} / {formatNumber(metrics.capacity)}
          </span>
        </li>
      </ul>
    </div>
  )
}

function ByStatusGroup({ metrics }: MetricsGroup) {
  const entries = Object.entries(metrics.summary.by_status)
  if (entries.length === 0) return null
  return (
    <div>
      <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted">By status</p>
      <ul className="mt-2 divide-y divide-line rounded-md border border-line bg-canvas">
        {entries.map(([status, count]) => (
          <li className="flex items-center justify-between px-4 py-2 text-sm" key={status}>
            <span className="font-mono text-ink-soft">{status}</span>
            <span className="font-mono tabular-nums text-ink">{formatNumber(count)}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

function ByPathGroup({ metrics }: MetricsGroup) {
  const entries = Object.entries(metrics.summary.by_path)
  if (entries.length === 0) return null
  return (
    <div>
      <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted">By path (top 10)</p>
      <ul className="mt-2 divide-y divide-line rounded-md border border-line bg-canvas">
        {entries
          .sort((a, b) => b[1] - a[1])
          .slice(0, 10)
          .map(([path, count]) => (
            <li className="flex items-center justify-between px-4 py-2 text-sm" key={path}>
              <span className="truncate font-mono text-ink-soft">{path}</span>
              <span className="font-mono tabular-nums text-ink">{formatNumber(count)}</span>
            </li>
          ))}
      </ul>
    </div>
  )
}

function RecentGroup({ metrics }: MetricsGroup) {
  if (metrics.recent.length === 0) return null
  return (
    <div>
      <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted">Most recent requests</p>
      <ul className="mt-2 divide-y divide-line rounded-md border border-line bg-canvas">
        {metrics.recent
          .slice(0, 8)
          .map((r) => (
            <li className="grid grid-cols-[auto_1fr_auto] items-center gap-3 px-4 py-2 text-xs" key={r.request_id}>
              <span
                className={`rounded px-1.5 py-0.5 font-mono text-[10px] ${
                  r.status_code >= 500
                    ? 'bg-rose-50 text-rose-700'
                    : r.status_code >= 400
                      ? 'bg-amber-50 text-amber-700'
                      : 'bg-emerald-50 text-emerald-700'
                }`}
              >
                {r.status_code}
              </span>
              <span className="truncate font-mono text-ink-soft">
                {r.method} {r.path}
              </span>
              <span className="font-mono tabular-nums text-muted">
                {r.duration_ms.toFixed(1)} ms
              </span>
            </li>
          ))}
      </ul>
    </div>
  )
}
