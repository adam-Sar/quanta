import { useQuery } from '@tanstack/react-query'
import { Database, Plus } from 'lucide-react'
import { Link } from 'react-router-dom'

import { listDatasets } from '../api/datasets'
import { getHealth, getReadiness } from '../api/health'
import { ApiError } from '../api/client'
import { formatNumber, formatTimestamp } from '../lib/utils'
import { Badge } from '../components/ui/Badge'
import { Button } from '../components/ui/Button'
import { EmptyState } from '../components/ui/EmptyState'
import { ErrorState } from '../components/ui/ErrorState'
import { LoadingSkeleton } from '../components/ui/LoadingSkeleton'
import { PageHeader } from '../components/ui/PageHeader'
import { Panel, SectionHeading } from '../components/ui/Panel'
import type { DatasetResponse } from '../types/api'

const RECENT_DATASET_LIMIT = 6

type Tone = 'success' | 'warning' | 'danger' | 'muted'

function StatusDot({ tone }: { tone: Tone }) {
  const colorClass =
    tone === 'success'
      ? 'bg-success'
      : tone === 'warning'
        ? 'bg-warning'
        : tone === 'danger'
          ? 'bg-danger'
          : 'bg-muted'
  return <span aria-hidden="true" className={`inline-block h-1.5 w-1.5 rounded-full ${colorClass}`} />
}

function HealthRow({
  detail,
  label,
  timestamp,
  tone,
}: {
  label: string
  detail: string
  tone: Tone
  timestamp?: string
}) {
  return (
    <div className="grid grid-cols-1 gap-1 border-b border-line py-3 last:border-b-0 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)_auto] sm:items-center sm:gap-x-6">
      <div className="flex items-center gap-2.5">
        <StatusDot tone={tone} />
        <span className="text-sm font-medium text-ink">{label}</span>
      </div>
      <span className="text-sm text-muted">{detail}</span>
      <span className="font-mono text-[11px] text-muted/80">
        {timestamp ? formatTimestamp(timestamp) : ''}
      </span>
    </div>
  )
}

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
  const datasetsQuery = useQuery({
    queryKey: ['datasets', { page: 1, pageSize: RECENT_DATASET_LIMIT }],
    queryFn: () => listDatasets({ page: 1, pageSize: RECENT_DATASET_LIMIT }),
    retry: 1,
    staleTime: 10_000,
  })

  const readinessTone: Tone = readinessQuery.isSuccess ? 'success' : 'warning'
  const readinessDetail = readinessQuery.isSuccess
    ? 'Connected'
    : readinessQuery.error instanceof ApiError
      ? readinessQuery.error.message
      : 'Unavailable'

  const recentDatasets = datasetsQuery.data?.items ?? []
  const datasetsTotal = datasetsQuery.data?.pagination.total_items ?? 0

  return (
    <div className="space-y-6">
      <PageHeader
        action={
          <Link to="/datasets">
            <Button variant="primary">
              <Plus aria-hidden="true" size={16} />
              Add dataset
            </Button>
          </Link>
        }
        description="Service health, the dataset inventory, and the most recent activity in Quanta."
        title="Overview"
      />

      <Panel>
        <div className="grid grid-cols-1 md:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
          <div className="border-b border-line p-5 md:border-b-0 md:border-r md:px-6">
            <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted">Backend</p>
            <p className="mt-2 flex items-center gap-2 text-base font-semibold text-ink">
              <StatusDot tone={readinessTone} />
              {readinessQuery.isSuccess ? 'Healthy' : 'Unavailable'}
            </p>
            <p className="mt-1 text-xs text-muted">
              {healthQuery.isSuccess ? `${healthQuery.data.service} · ${healthQuery.data.version}` : '—'}
            </p>
          </div>
          <div className="px-5 py-2 md:px-6">
            {healthQuery.isPending ? (
              <div className="py-4">
                <LoadingSkeleton lines={2} />
              </div>
            ) : healthQuery.isError ? (
              <div className="py-4">
                <ErrorState
                  message={healthQuery.error instanceof ApiError ? healthQuery.error.message : 'The liveness check failed.'}
                  onRetry={() => void healthQuery.refetch()}
                  requestId={healthQuery.error instanceof ApiError ? healthQuery.error.requestId : null}
                  title="Liveness check failed"
                />
              </div>
            ) : (
              <>
                <HealthRow
                  detail={healthQuery.data.service}
                  label="Process liveness"
                  timestamp={healthQuery.data.timestamp}
                  tone="success"
                />
                <HealthRow
                  detail={readinessDetail}
                  label="PostgreSQL"
                  timestamp={readinessQuery.data?.timestamp}
                  tone={readinessTone}
                />
              </>
            )}
          </div>
        </div>
      </Panel>

      <Panel padded={false}>
        <div className="flex items-center justify-between gap-4 border-b border-line px-5 py-4 md:px-6">
          <SectionHeading
            description="The most recently updated datasets in the workspace."
            eyebrow="Inventory"
            title="Recent datasets"
          />
          {datasetsTotal > 0 ? (
            <Link
              className="shrink-0 text-xs text-muted hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
              to="/datasets"
            >
              View all <span aria-hidden="true">→</span>
            </Link>
          ) : null}
        </div>

        {datasetsQuery.isPending ? (
          <div className="p-5 md:p-6">
            <LoadingSkeleton lines={4} />
          </div>
        ) : datasetsQuery.isError ? (
          <div className="p-5 md:p-6">
            <ErrorState
              message={
                datasetsQuery.error instanceof ApiError
                  ? datasetsQuery.error.message
                  : 'The dataset inventory is unreachable.'
              }
              onRetry={() => void datasetsQuery.refetch()}
              requestId={datasetsQuery.error instanceof ApiError ? datasetsQuery.error.requestId : null}
              title="Datasets could not be loaded"
            />
          </div>
        ) : recentDatasets.length === 0 ? (
          <EmptyState
            className="m-5"
            description="Upload a CSV or Parquet file to add the first source to the workspace."
            icon={Database}
            title="No datasets yet"
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-[720px] w-full text-left text-sm">
              <thead>
                <tr className="border-b border-line bg-canvas/30 text-[10px] uppercase tracking-[0.12em] text-muted">
                  <th className="px-5 py-2.5 font-semibold md:px-6">Name</th>
                  <th className="px-3 py-2.5 text-right font-semibold">Rows</th>
                  <th className="px-3 py-2.5 text-right font-semibold">Columns</th>
                  <th className="px-3 py-2.5 font-semibold">Format</th>
                  <th className="px-3 py-2.5 font-semibold">Status</th>
                  <th className="px-5 py-2.5 text-right font-semibold md:px-6">Updated</th>
                </tr>
              </thead>
              <tbody>
                {recentDatasets.map((dataset: DatasetResponse) => {
                  const version = dataset.current_version
                  return (
                    <tr
                      className="border-b border-line/70 last:border-b-0 hover:bg-elevated/40"
                      key={dataset.id}
                    >
                      <td className="px-5 py-3 md:px-6">
                        <Link
                          className="font-medium text-ink hover:text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                          to={`/datasets/${dataset.id}`}
                        >
                          {dataset.name}
                        </Link>
                      </td>
                      <td className="px-3 py-3 text-right font-mono tabular-nums text-ink">
                        {version ? formatNumber(version.row_count) : '—'}
                      </td>
                      <td className="px-3 py-3 text-right font-mono tabular-nums text-ink">
                        {version ? formatNumber(version.column_count) : '—'}
                      </td>
                      <td className="px-3 py-3 text-muted">{version?.format?.toUpperCase() ?? '—'}</td>
                      <td className="px-3 py-3">
                        <Badge dot tone={version?.status === 'stored' ? 'success' : 'muted'}>
                          {version?.status ?? 'No version'}
                        </Badge>
                      </td>
                      <td className="px-5 py-3 text-right text-muted md:px-6">
                        {formatTimestamp(dataset.updated_at)}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </div>
  )
}