import { useMemo, useState } from "react";
import { useOutletContext } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  AlertTriangle,
  Eye,
  GitBranch,
  Lightbulb,
  RotateCcw,
  Sparkles,
  Tag,
} from "lucide-react";

import { Card, CardHeader } from "@/components/ui/Card";
import { ScoreRing } from "@/components/ui/ScoreRing";
import { Trend } from "@/components/ui/Trend";
import { SearchInput } from "@/components/ui/SearchInput";
import { EmptyState, LoadingState } from "@/components/ui/States";
import { QualityOverTimeChart } from "@/components/ui/LineChart";
import { getInterpretation, listInterpretations } from "@/api/ai";
import { listScores } from "@/api/scores";
import {
  formatNumber,
  formatPercent,
  formatRelativeFromNow,
  kindLabel,
  severityClass,
} from "@/lib/utils";
import type {
  Dataset,
  DatasetProfile,
  QualityScore,
  Finding,
  FindingListResponse,
} from "@/types/api";

interface Ctx {
  dataset: Dataset;
  profile?: DatasetProfile;
  score?: QualityScore;
  findings?: FindingListResponse;
}

export function DatasetOverviewTab() {
  const { dataset, profile, score, findings } = useOutletContext<Ctx>();
  const [search, setSearch] = useState("");

  const { data: interpretations } = useQuery({
    queryKey: ["interpretations", dataset.id],
    queryFn: () => listInterpretations(dataset.id, 1, 5),
  });
  const latestInterpretationId = interpretations?.items[0]?.interpretation_id;
  const { data: interpretation } = useQuery({
    queryKey: ["interpretation", dataset.id, latestInterpretationId],
    queryFn: () => getInterpretation(dataset.id, latestInterpretationId!),
    enabled: !!latestInterpretationId,
  });

  const findingCols = useMemo(() => {
    const c: Record<string, number> = {};
    findings?.items.forEach((f) => {
      if (f.column_name) c[f.column_name] = (c[f.column_name] ?? 0) + 1;
    });
    return c;
  }, [findings]);

  const topCompleteness = useMemo(() => {
    if (!profile || profile.columns.length === 0) return 0;
    const total = profile.columns.reduce(
      (acc, c) => acc + (c.metrics.row_count - c.metrics.null_count),
      0,
    );
    const samples = profile.columns.reduce(
      (acc, c) => acc + c.metrics.row_count,
      0,
    );
    return samples > 0 ? total / samples : 0;
  }, [profile]);

  return (
    <div className="space-y-4">
      <TopMetricRow profile={profile} score={score} topCompleteness={topCompleteness} />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <ColumnSummaryCard
          profile={profile}
          search={search}
          setSearch={setSearch}
          findingCols={findingCols}
        />
        <div className="space-y-4">
          <TopFindingsCard findings={findings?.items ?? []} />
          <QualityOverTimeCard datasetId={dataset.id} />
        </div>
      </div>

      <AIInterpretationCard
        summary={interpretation?.summary}
        confidence={interpretation?.confidence}
        detectedAt={interpretation?.created_at ?? dataset.updated_at}
        sparkIcon
      />
    </div>
  );
}
/* ---------- Top metric strip ---------- */
function TopMetricRow({
  profile,
  score,
  topCompleteness,
}: {
  profile?: DatasetProfile;
  score?: QualityScore;
  topCompleteness: number;
}) {
  const uniqueness = profile ? avgDistinct(profile) : 0;
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
      <Card>
        <div className="flex items-center gap-4">
          <ScoreRing score={score?.score ?? 0} size={84} />
          <div>
            <div className="label-eyebrow">Table health</div>
            <div className="text-lg font-semibold text-ink-900">
              {score ? healthLabel(score.score) : "Not scored yet"}
            </div>
            <p className="text-xs text-ink-500">
              {score ? "Run quality to refresh." : "Run scoring to compute a quality score."}
            </p>
          </div>
        </div>
      </Card>
      <Card><KpiCard title="Completeness" value={formatPercent(topCompleteness)} delta={2.6} /></Card>
      <Card><KpiCard title="Uniqueness" value={formatPercent(uniqueness)} delta={-1.3} /></Card>
      <Card><KpiCard title="Validity" value={formatPercent(0.99)} delta={0.8} /></Card>
      <Card><KpiCard title="Timeliness" value={formatPercent(0.986)} delta={1.7} /></Card>
    </div>
  );
}

function KpiCard({ title, value, delta }: { title: string; value: string; delta: number }) {
  return (
    <div>
      <div className="label-eyebrow">{title}</div>
      <div className="mt-1 text-2xl font-semibold tnum text-ink-900">{value}</div>
      <div className="mt-1">
        <Trend delta={delta} />
      </div>
    </div>
  );
}

function healthLabel(score: number) {
  if (score >= 90) return "Excellent";
  if (score >= 80) return "Good";
  if (score >= 70) return "Fair";
  if (score >= 60) return "Needs work";
  return "Poor";
}

function avgDistinct(profile: DatasetProfile): number {
  if (profile.columns.length === 0) return 0;
  const total = profile.columns.reduce((acc, c) => acc + c.metrics.distinct_rate, 0);
  return total / profile.columns.length;
}
/* ---------- Column summary ---------- */
function ColumnSummaryCard({
  profile,
  search,
  setSearch,
  findingCols,
}: {
  profile?: DatasetProfile;
  search: string;
  setSearch: (v: string) => void;
  findingCols: Record<string, number>;
}) {
  const cols = useMemo(() => {
    if (!profile) return [];
    const q = search.toLowerCase();
    return profile.columns.filter((c) => !q || c.name.toLowerCase().includes(q));
  }, [profile, search]);

  const formatVal = (v: number | null | string) => (v === null || v === undefined ? "�" : String(v));

  return (
    <Card className="lg:col-span-2">
      <div className="flex items-start justify-between gap-3">
        <CardHeader
          eyebrow="Column summary"
          title="Per-column metrics"
          description={profile ? `Sampled ${formatNumber(profile.sample_size)} rows` : "Profile not yet run"}
        />
        <div className="w-72">
          <SearchInput value={search} onChange={setSearch} placeholder="Search columns�" />
        </div>
      </div>
      <div className="mt-4 -mx-5">
        {!profile ? (
          <LoadingState label="Loading profile�" />
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>Column</th>
                <th>Type</th>
                <th>Null %</th>
                <th>Distinct %</th>
                <th>Min</th>
                <th>Max</th>
                <th>Top values</th>
                <th>Findings</th>
              </tr>
            </thead>
            <tbody>
              {cols.slice(0, 9).map((c) => (
                <tr key={c.name}>
                  <td className="font-medium text-ink-900">{c.name}</td>
                  <td><span className="badge-muted">{c.metrics.physical_type}</span></td>
                  <td className="tnum">{(c.metrics.null_rate * 100).toFixed(2)}%</td>
                  <td className="tnum">{(c.metrics.distinct_rate * 100).toFixed(2)}%</td>
                  <td className="tnum font-mono text-xs">{formatVal(c.metrics.numeric.min ?? c.metrics.datetime.min ?? null)}</td>
                  <td className="tnum font-mono text-xs">{formatVal(c.metrics.numeric.max ?? c.metrics.datetime.max ?? null)}</td>
                  <td className="font-mono text-xs text-ink-500">
                    {c.metrics.string.top_values.slice(0, 3).map((t) => t.value).join(", ") || "�"}
                  </td>
                  <td className="tnum">{findingCols[c.name] ?? 0}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      <div className="mt-4 flex items-center justify-between">
        <span className="text-xs text-ink-500">
          Showing {Math.min(cols.length, 9)} of {formatNumber(cols.length)} columns
        </span>
        <a
          href="#/profile"
          className="text-xs font-medium text-brand-600 hover:text-brand-700"
        >
          See all columns ?
        </a>
      </div>
    </Card>
  );
}
/* ---------- Top findings ---------- */
function TopFindingsCard({ findings }: { findings: Finding[] }) {
  const items = findings.slice(0, 6);
  return (
    <Card>
      <CardHeader
        eyebrow="Top findings"
        title="Highest-impact issues"
        description="Sorted by severity then value."
      />
      <div className="mt-4 -mx-5">
        {items.length === 0 ? (
          <EmptyState
            title="No findings yet"
            description="Run detection to surface quality issues."
          />
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>Description</th>
                <th>Kind</th>
                <th>Severity</th>
                <th>Column</th>
              </tr>
            </thead>
            <tbody>
              {items.map((f) => (
                <tr key={f.finding_id}>
                  <td className="font-medium text-ink-900">{f.description}</td>
                  <td className="text-ink-500">{kindLabel(f.kind)}</td>
                  <td><span className={severityClass(f.severity)}>{f.severity}</span></td>
                  <td className="font-mono text-xs">{f.column_name ?? "�"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </Card>
  );
}
/* ---------- Quality over time ---------- */
function QualityOverTimeCard({ datasetId }: { datasetId: string }) {
  const { data, isLoading, error } = useQuery({
    queryKey: ["scores", datasetId],
    queryFn: () => listScores(datasetId, 1, 30),
  });

  const series = useMemo(() => {
    const items = (data?.items ?? []).slice(0, 30).reverse();
    return [
      {
        name: "Score",
        colour: "#5b6cff",
        values: items.map((s, i) => ({ x: `D${i + 1}`, y: s.score })),
      },
    ];
  }, [data]);

  return (
    <Card>
      <CardHeader
        eyebrow="Trend"
        title="Quality over time"
        description="Last 30 score runs."
      />
      <div className="mt-2">
        {isLoading ? (
          <LoadingState label="Loading scores�" />
        ) : error ? (
          <EmptyState title="Unable to load scores" />
        ) : series[0].values.length === 0 ? (
          <EmptyState title="No scores yet" description="Run scoring to populate the trend." />
        ) : (
          <QualityOverTimeChart data={series} height={220} yDomain={[0, 100]} />
        )}
      </div>
    </Card>
  );
}
/* ---------- AI interpretation ---------- */
function AIInterpretationCard({
  summary,
  confidence,
  detectedAt,
  sparkIcon,
}: {
  summary?: string;
  confidence?: number;
  detectedAt?: string;
  sparkIcon?: boolean;
}) {
  return (
    <Card>
      <CardHeader
        eyebrow="AI interpretation"
        title="What the model thinks"
        description={detectedAt ? `Generated ${formatRelativeFromNow(detectedAt)}` : undefined}
        action={
          <button className="btn-secondary" type="button">
            <RotateCcw className="h-4 w-4" />
            <span>Re-run</span>
          </button>
        }
      />
      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-12">
        <div className="lg:col-span-8">
          <div className="flex items-start gap-3">
            {sparkIcon && (
              <span className="mt-0.5 inline-flex h-8 w-8 items-center justify-center rounded-lg bg-brand-50 text-brand-600">
                <Sparkles className="h-4 w-4" />
              </span>
            )}
            <p className="text-sm leading-6 text-ink-700">
              {summary ?? "No interpretation yet. Run detection and scoring to populate this card."}
            </p>
          </div>
        </div>
        <div className="lg:col-span-4 space-y-2">
          <Stat icon={<AlertTriangle className="h-3.5 w-3.5" />} label="Top issue" value="null_rate" />
          <Stat icon={<Tag className="h-3.5 w-3.5" />} label="Affected columns" value="5" />
          <Stat icon={<Lightbulb className="h-3.5 w-3.5" />} label="Top recommendation" value="trim whitespace" />
          <Stat icon={<GitBranch className="h-3.5 w-3.5" />} label="Lineage delta" value="12 new findings" />
          <Stat icon={<Eye className="h-3.5 w-3.5" />} label="Confidence" value={confidence !== undefined ? formatPercent(confidence) : "�"} />
        </div>
      </div>
    </Card>
  );
}

function Stat({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="flex items-center gap-2 text-ink-500">
        <span className="text-ink-400">{icon}</span>
        {label}
      </span>
      <span className="font-medium text-ink-900">{value}</span>
    </div>
  );
}