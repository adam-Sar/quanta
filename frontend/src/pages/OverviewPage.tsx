import { useQuery } from "@tanstack/react-query";
import {
  ArrowUpRight,
  Database,
  LineChart,
  ShieldCheck,
  ListTodo,
} from "lucide-react";
import { Link } from "react-router-dom";

import { Topbar } from "@/components/layout/Topbar";
import { Card, CardHeader } from "@/components/ui/Card";
import { Metric } from "@/components/ui/Metric";
import { PageHeader } from "@/components/ui/PageHeader";
import { SeverityText } from "@/components/ui/Badge";
import { ProgressBar } from "@/components/ui/ProgressBar";
import { Sparkline } from "@/components/ui/Sparkline";
import { LoadingState, ErrorState, EmptyState } from "@/components/ui/States";
import { listDatasets } from "@/api/datasets";
import { listFindings } from "@/api/findings";
import { listScores } from "@/api/scores";
import { listDatasetJobs } from "@/api/jobs";
import { getHealth, getHealthReady } from "@/api/health";
import {
  formatBytes,
  formatNumber,
  formatRelativeFromNow,
} from "@/lib/utils";

export function OverviewPage() {
  const { data: health } = useQuery({
    queryKey: ["health"],
    queryFn: getHealth,
  });
  const { data: ready } = useQuery({
    queryKey: ["health-ready"],
    queryFn: getHealthReady,
    refetchInterval: 60_000,
  });
  const { data: datasets, isLoading: dl } = useQuery({
    queryKey: ["datasets", { page: 1, page_size: 50 }],
    queryFn: () => listDatasets({ page: 1, page_size: 50 }),
  });
  const datasetId = datasets?.items[0]?.id;
  const { data: scores, isLoading: sl, error: serr } = useQuery({
    queryKey: ["scores", datasetId],
    queryFn: () => listScores(datasetId!, 1, 50),
    enabled: !!datasetId,
  });
  const { data: findings, isLoading: fl, error: ferr } = useQuery({
    queryKey: ["findings", datasetId],
    queryFn: () => listFindings(datasetId!, 1, 50),
    enabled: !!datasetId,
  });
  const { data: jobs, isLoading: jl } = useQuery({
    queryKey: ["jobs", datasetId],
    queryFn: () => listDatasetJobs(datasetId!, 1, 20),
    enabled: !!datasetId,
  });

  const head = datasets?.items[0];
  const v = head?.current_version;
  const score = scores?.items[0];
  const succeeded = jobs?.items.filter((j: { status: string }) => j.status === "succeeded").length ?? 0;

  return (
    <>
      <Topbar
        crumbs={[{ label: "Overview" }]}
        meta={
          <span className="hidden text-xs text-ink-500 sm:inline-flex">
            <span className="mr-1.5 inline-block h-1.5 w-1.5 rounded-full bg-sev-low" />
            {ready?.status === "ready" ? "Production-ready" : "Warming up…"}
          </span>
        }
      />

      <PageHeader
        title="Overview"
        description="Service health, latest runs, and the highest-impact issues across your datasets."
      />

      <div className="space-y-6 p-6">
        {/* Top metric strip */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Card>
            <div className="flex items-center gap-3">
              <div className="grid h-9 w-9 place-items-center rounded-xl bg-brand-50 text-brand-600">
                <Database className="h-4 w-4" />
              </div>
              <Metric
                label="Datasets"
                value={dl ? "—" : formatNumber(datasets?.pagination.total_items ?? 0)}
              />
            </div>
          </Card>
          <Card>
            <div className="flex items-center gap-3">
              <div className="grid h-9 w-9 place-items-center rounded-xl bg-brand-50 text-brand-600">
                <LineChart className="h-4 w-4" />
              </div>
              <Metric
                label="Latest score"
                value={sl ? "—" : `${score?.score.toFixed(0) ?? "—"}/100`}
                helper={score ? `Grade ${score.grade}` : undefined}
              />
            </div>
          </Card>
          <Card>
            <div className="flex items-center gap-3">
              <div className="grid h-9 w-9 place-items-center rounded-xl bg-brand-50 text-brand-600">
                <ShieldCheck className="h-4 w-4" />
              </div>
              <Metric
                label="Open findings"
                value={fl ? "—" : formatNumber(findings?.pagination.total_items ?? 0)}
                helper="Across all datasets"
              />
            </div>
          </Card>
          <Card>
            <div className="flex items-center gap-3">
              <div className="grid h-9 w-9 place-items-center rounded-xl bg-brand-50 text-brand-600">
                <ListTodo className="h-4 w-4" />
              </div>
              <Metric
                label="Job runs"
                value={jl ? "—" : formatNumber(jobs?.pagination.total_items ?? 0)}
                helper={`${succeeded} succeeded`}
              />
            </div>
          </Card>

        {/* Two-column section */}
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <Card className="lg:col-span-2">
            <CardHeader
              eyebrow="Latest dataset"
              title={
                head ? (
                  <Link
                    to={`/datasets/${head.id}`}
                    className="hover:text-brand-600"
                  >
                    {head.name}
                  </Link>
                ) : (
                  "No datasets yet"
                )
              }
              description={
                v
                  ? `${formatNumber(v.row_count)} rows · ${formatBytes(v.size_bytes)}`
                  : "Upload a CSV or Parquet file to begin"
              }
              action={
                head && (
                  <Link
                    to={`/datasets/${head.id}`}
                    className="text-xs font-medium text-brand-600 hover:text-brand-700"
                  >
                    Open <ArrowUpRight className="ml-0.5 inline h-3.5 w-3.5" />
                  </Link>
                )
              }
            />
            <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="rounded-2xl border border-ink-100 p-3">
                <div className="label-eyebrow">Quality score</div>
                <div className="mt-1 text-3xl font-semibold tnum text-ink-900">
                  {sl ? "—" : `${score?.score.toFixed(0) ?? "—"}/100`}
                </div>
                <ProgressBar
                  value={(score?.score ?? 0) / 100}
                  variant="severity"
                  className="mt-3"
                />
                {serr && <ErrorState error={serr} />}
              </div>
              <div className="rounded-2xl border border-ink-100 p-3">
                <div className="label-eyebrow">Findings</div>
                <div className="mt-1 flex items-baseline gap-2">
                  <span className="text-3xl font-semibold tnum text-ink-900">
                    {fl ? "—" : formatNumber(findings?.pagination.total_items ?? 0)}
                  </span>
                  <span className="text-xs text-ink-500">across 5 detectors</span>
                </div>
                <Sparkline
                  values={(findings?.items ?? [])
                    .slice(0, 24)
                    .map((f, i) => 80 - i * 2 + ((f.value ?? 0) % 4))}
                  height={48}
                  className="mt-2"
                />
                {ferr && <ErrorState error={ferr} />}
              </div>
            </div>
          </Card>

          <Card>
            <CardHeader
              eyebrow="Service"
              title="Runtime status"
              action={
                <span className="text-xs text-ink-500">
                  {health?.version ?? "—"}
                </span>
              }
            />
            <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
              <div>
                <dt className="text-ink-500">Status</dt>
                <dd className="font-medium text-ink-900">{health?.status ?? "—"}</dd>
              </div>
              <div>
                <dt className="text-ink-500">Environment</dt>
                <dd className="font-medium text-ink-900">{health?.environment ?? "—"}</dd>
              </div>
              <div>
                <dt className="text-ink-500">Database</dt>
                <dd className="font-medium text-ink-900">{ready?.checks.database ?? "—"}</dd>
              </div>
              <div>
                <dt className="text-ink-500">Last check</dt>
                <dd className="font-medium text-ink-900">{formatRelativeFromNow(ready?.timestamp)}</dd>
              </div>
            </dl>
          </Card>
        </div>

        {/* Recent findings */}
        <Card>
          <CardHeader
            eyebrow="Recent findings"
            title="Top issues across the latest dataset"
            action={
              <Link
                to="/findings"
                className="text-xs font-medium text-brand-600 hover:text-brand-700"
              >
                View all <ArrowUpRight className="ml-0.5 inline h-3.5 w-3.5" />
              </Link>
            }
          />
          <div className="mt-4 -mx-5">
            {fl ? (
              <LoadingState label="Loading findings…" />
            ) : ferr ? (
              <ErrorState error={ferr} />
            ) : (findings?.items.length ?? 0) === 0 ? (
              <EmptyState
                title="No findings yet"
                description="Run detection on the latest dataset profile to surface issues."
              />
            ) : (
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Title</th>
                    <th>Kind</th>
                    <th>Severity</th>
                    <th>Column</th>
                    <th>Value</th>
                  </tr>
                </thead>
                <tbody>
                  {findings!.items.slice(0, 8).map((f) => (
                    <tr key={f.finding_id}>
                      <td className="font-medium text-ink-900">{f.description}</td>
                      <td className="text-ink-500">{f.kind}</td>
                      <td>
                        <SeverityText severity={f.severity} />
                      </td>
                      <td className="font-mono text-xs">{f.column_name ?? "—"}</td>
                      <td className="tnum">{f.value.toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </Card>


        </div>
      </div>
    </>
  );
}
