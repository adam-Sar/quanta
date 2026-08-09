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
  const { data: scores, isLoading: sl } = useQuery({
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
  const v = head?.current_version ?? null;
  const score = scores?.items[0];
  const totalFindings = findings?.pagination.total_items ?? 0;
  const totalJobs = jobs?.pagination.total_items ?? 0;
  const succeeded =
    jobs?.items.filter((j: { status: string }) => j.status === "succeeded")
      .length ?? 0;

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
          <KpiCard
            icon={<Database className="h-4 w-4" />}
            label="Datasets"
            value={dl ? "—" : formatNumber(datasets?.pagination.total_items ?? 0)}
          />
          <KpiCard
            icon={<LineChart className="h-4 w-4" />}
            label="Latest score"
            value={
              sl || !datasetId
                ? "—"
                : score
                ? `${score.score.toFixed(0)}/100`
                : "—/100"
            }
            helper={
              score
                ? `Grade ${score.grade} on ${head?.name ?? "latest dataset"}`
                : datasetId
                ? `No score yet on ${head?.name ?? "latest dataset"}`
                : "No datasets yet"
            }
          />
          <KpiCard
            icon={<ShieldCheck className="h-4 w-4" />}
            label="Open findings"
            value={fl ? "—" : formatNumber(totalFindings)}
            helper={
              datasetId
                ? `On ${head?.name ?? "latest dataset"}`
                : "Across all datasets"
            }
          />
          <KpiCard
            icon={<ListTodo className="h-4 w-4" />}
            label="Job runs"
            value={jl ? "—" : formatNumber(totalJobs)}
            helper={`${succeeded} succeeded`}
          />
        </div>

        {/* Two-column section: latest dataset hero + service health */}
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
                  ? `${formatNumber(v.row_count)} ${v.row_count === 1 ? "row" : "rows"} · ${formatNumber(v.column_count)} ${v.column_count === 1 ? "column" : "columns"} · ${formatBytes(v.size_bytes)}`
                  : "Upload a CSV or Parquet file to begin"
              }
              action={
                head && (
                  <Link
                    to={`/datasets/${head.id}`}
                    className="inline-flex items-center gap-0.5 text-xs font-medium text-brand-600 hover:text-brand-700"
                  >
                    Open <ArrowUpRight className="h-3.5 w-3.5" />
                  </Link>
                )
              }
            />
            <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
              <SubStatCard
                label="Quality score"
                value={
                  sl || !datasetId
                    ? "—/100"
                    : score
                    ? `${score.score.toFixed(0)}/100`
                    : "—/100"
                }
                footer={
                  <ProgressBar
                    value={(score?.score ?? 0) / 100}
                    variant="severity"
                  />
                }
              />
              <SubStatCard
                label="Findings"
                value={fl ? "—" : formatNumber(totalFindings)}
                footer={
                  <Sparkline
                    values={
                      (findings?.items ?? []).length
                        ? (findings!.items ?? [])
                            .slice(0, 24)
                            .map((f, i) => 80 - i * 2 + ((f.value ?? 0) % 4))
                        : [70, 72, 75, 76, 78]
                    }
                    height={48}
                  />
                }
              />
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
            <dl className="mt-4 grid grid-cols-2 gap-x-3 gap-y-3 text-sm">
              <Field label="Status" value={health?.status ?? "—"} />
              <Field label="Environment" value={health?.environment ?? "—"} />
              <Field label="Database" value={ready?.checks.database ?? "—"} />
              <Field
                label="Last check"
                value={formatRelativeFromNow(ready?.timestamp)}
              />
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
                className="inline-flex items-center gap-0.5 text-xs font-medium text-brand-600 hover:text-brand-700"
              >
                View all <ArrowUpRight className="h-3.5 w-3.5" />
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
                      <td className="font-medium text-ink-900">
                        {f.description}
                      </td>
                      <td className="text-ink-500">{f.kind}</td>
                      <td>
                        <SeverityText severity={f.severity} />
                      </td>
                      <td className="font-mono text-xs">
                        {f.column_name ?? "—"}
                      </td>
                      <td className="tnum">{f.value.toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </Card>
      </div>
    </>
  );
}

/* ---------- Small layout helpers ---------- */

function KpiCard({
  icon,
  label,
  value,
  helper,
}: {
  icon: React.ReactNode;
  label: string;
  value: React.ReactNode;
  helper?: React.ReactNode;
}) {
  return (
    <Card>
      <div className="flex items-start gap-3">
        <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-brand-50 text-brand-600">
          {icon}
        </div>
        <div className="min-w-0 flex-1">
          <Metric label={label} value={value} helper={helper} />
        </div>
      </div>
    </Card>
  );
}

function SubStatCard({
  label,
  value,
  footer,
}: {
  label: string;
  value: React.ReactNode;
  footer?: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-ink-100 p-4">
      <div className="label-eyebrow">{label}</div>
      <div className="mt-1 text-3xl font-semibold tnum text-ink-900">{value}</div>
      {footer && <div className="mt-3">{footer}</div>}
    </div>
  );
}

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-ink-500">{label}</dt>
      <dd className="truncate font-medium text-ink-900">{value}</dd>
    </div>
  );
}
