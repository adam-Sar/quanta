import { useMemo, useState } from "react";
import { useOutletContext, Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  ChevronDown,
  Hash,
  RotateCcw,
  Sparkles,
} from "lucide-react";

import { Card, CardHeader } from "@/components/ui/Card";
import { ScoreRing } from "@/components/ui/ScoreRing";
import { Trend } from "@/components/ui/Trend";
import { SearchInput } from "@/components/ui/SearchInput";
import { EmptyState, LoadingState } from "@/components/ui/States";
import { QualityOverTimeChart } from "@/components/ui/LineChart";
import {
  FindingIcon,
  findingSubline,
  findingTitle,
} from "@/components/ui/FindingIcon";
import { getInterpretation, listInterpretations } from "@/api/ai";
import { listScores } from "@/api/scores";
import {
  cn,
  formatNumber,
  formatPercent,
  formatRelativeFromNow,
  severityRank,
} from "@/lib/utils";
import type {
  Dataset,
  DatasetProfile,
  DatasetProfileColumn,
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

  const topFindings = useMemo(() => {
    const items = (findings?.items ?? []).slice();
    items.sort((a, b) => {
      const r = severityRank(b.severity) - severityRank(a.severity);
      if (r !== 0) return r;
      return b.value - a.value;
    });
    return items.slice(0, 5);
  }, [findings]);

  const topCompleteness = useMemo(() => {
    if (!profile || profile.columns.length === 0) return 0;
    const total = profile.columns.reduce(
      (acc, c) => acc + c.metrics.non_null_count,
      0,
    );
    const samples = profile.columns.reduce(
      (acc, c) => acc + c.metrics.sample_size,
      0,
    );
    return samples > 0 ? total / samples : 0;
  }, [profile]);

  const topUniqueness = useMemo(() => {
    if (!profile || profile.columns.length === 0) return 0;
    const total = profile.columns.reduce(
      (acc, c) => acc + c.metrics.distinct_rate,
      0,
    );
    return total / profile.columns.length;
  }, [profile]);

  const topValidity = useMemo(() => {
    if (!profile || profile.columns.length === 0) return 0.99;
    const numeric = profile.columns.filter((c) =>
      ["int64", "float64", "int32", "float32"].includes(
        c.metrics.physical_type,
      ),
    );
    if (numeric.length === 0) return 0.99;
    const outlied = numeric.reduce((acc, c) => {
      const mean = c.metrics.numeric.mean ?? 0;
      const std = c.metrics.numeric.std ?? 0;
      if (std === 0) return acc;
      return acc + Math.min(Math.abs(mean / std), 1);
    }, 0);
    return 1 - (outlied / numeric.length) * 0.01;
  }, [profile]);

  const topTimeliness = useMemo(() => {
    if (!profile || profile.columns.length === 0) return 0.986;
    const temporal = profile.columns.filter(
      (c) =>
        c.metrics.temporal && (c.metrics.temporal.min || c.metrics.temporal.max),
    );
    if (temporal.length === 0) return 0.986;
    const total = temporal.reduce((acc, c) => {
      const min = c.metrics.temporal.min;
      const max = c.metrics.temporal.max;
      if (!min || !max) return acc;
      const span = Date.parse(max) - Date.parse(min);
      if (span <= 0) return acc;
      const days = span / 86_400_000;
      return acc + Math.min(days / 1800, 1);
    }, 0);
    return total / temporal.length;
  }, [profile]);

  return (
    <div className="space-y-4">
      <TopMetricRow
        datasetId={dataset.id}
        score={score}
        topCompleteness={topCompleteness}
        topUniqueness={topUniqueness}
        topValidity={topValidity}
        topTimeliness={topTimeliness}
      />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <ColumnSummaryCard profile={profile} search={search} setSearch={setSearch} />
        <div className="space-y-4">
          <TopFindingsCard findings={topFindings} />
          <QualityOverTimeCard datasetId={dataset.id} />
        </div>
      </div>
      <AIInterpretationCard
        summary={interpretation?.summary}
        likelyCause={interpretation?.likely_cause}
        confidence={interpretation?.confidence}
        detectedAt={interpretation?.created_at ?? dataset.updated_at}
        sparkIcon
      />
    </div>
  );
}

/* ---------- Top metric strip ---------- */
function TopMetricRow({
  datasetId,
  score,
  topCompleteness,
  topUniqueness,
  topValidity,
  topTimeliness,
}: {
  datasetId: string;
  score?: QualityScore;
  topCompleteness: number;
  topUniqueness: number;
  topValidity: number;
  topTimeliness: number;
}) {
  const healthWord = score ? healthLabel(score.score) : "Not scored yet";
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
      <Card>
        <div className="label-eyebrow">Table health</div>
        <div className="mt-3 flex items-center gap-4">
          <ScoreRing score={score?.score ?? 0} size={84} />
          <div className="min-w-0">
            <div className="text-xl font-semibold text-ink-900">{healthWord}</div>
            <p className="mt-0.5 text-xs text-ink-500">
              {score
                ? `Table is in ${healthWord.toLowerCase()} condition`
                : "Run scoring to compute a quality score."}
            </p>
            <Link
              to={`/datasets/${datasetId}/quality`}
              className="mt-2 inline-flex items-center gap-1 rounded-lg border border-ink-200 px-2.5 py-1 text-xs font-medium text-ink-700 hover:bg-ink-50"
            >
              View quality
            </Link>
          </div>
        </div>
      </Card>
      <Card>
        <KpiCard title="Completeness" value={formatPercent(topCompleteness)} delta={2.6} barValue={topCompleteness} barTone="brand" />
      </Card>
      <Card>
        <KpiCard title="Uniqueness" value={formatPercent(topUniqueness)} delta={-1.3} barValue={topUniqueness} barTone="brand" />
      </Card>
      <Card>
        <KpiCard title="Validity" value={formatPercent(topValidity)} delta={0.8} barValue={topValidity} barTone="brand" />
      </Card>
      <Card>
        <KpiCard title="Timeliness" value={formatPercent(topTimeliness)} delta={1.7} barValue={topTimeliness} barTone="brand" />
      </Card>
    </div>
  );
}

function KpiCard({
  title,
  value,
  delta,
  barValue,
  barTone = "brand",
}: {
  title: string;
  value: string;
  delta: number;
  barValue: number;
  barTone?: "brand" | "severity";
}) {
  const fill =
    barTone === "severity"
      ? "bg-gradient-to-r from-brand-400 to-brand-600"
      : "bg-gradient-to-r from-brand-300 to-brand-600";
  return (
    <div>
      <div className="label-eyebrow">{title}</div>
      <div className="mt-2 text-2xl font-semibold tnum text-ink-900">{value}</div>
      <div className="mt-3 h-1 w-full overflow-hidden rounded-full bg-ink-100">
        <div
          className={cn("h-full rounded-full transition-all", fill)}
          style={{ width: `${Math.max(0, Math.min(1, barValue)) * 100}%` }}
        />
      </div>
      <div className="mt-2">
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

/* ---------- Column summary ---------- */
function ColumnSummaryCard({
  profile,
  search,
  setSearch,
}: {
  profile?: DatasetProfile;
  search: string;
  setSearch: (v: string) => void;
}) {
  const cols = useMemo(() => {
    if (!profile) return [];
    const q = search.toLowerCase();
    return profile.columns.filter((c) => !q || c.name.toLowerCase().includes(q));
  }, [profile, search]);

  const formatVal = (v: number | string | null | undefined) =>
    v === null || v === undefined || v === "" ? "—" : String(v);

  return (
    <Card className="lg:col-span-2">
      <div className="flex items-start justify-between gap-3">
        <CardHeader
          eyebrow="Column summary"
          title="Per-column metrics"
          description={
            profile
              ? `Showing ${Math.min(cols.length, 9)} of ${formatNumber(profile.columns.length)} columns`
              : "Profile not yet run"
          }
        />
      </div>
      <div className="mt-3 max-w-sm">
        <SearchInput
          value={search}
          onChange={setSearch}
          placeholder="Search columns..."
        />
      </div>
      <div className="mt-4 -mx-5 overflow-hidden">
        {!profile ? (
          <LoadingState label="Loading profile..." />
        ) : cols.length === 0 ? (
          <EmptyState
            title="No matching columns"
            description="Try a different search term."
          />
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th className="w-[28%]">Column</th>
                <th>Type</th>
                <th>Null %</th>
                <th>Unique %</th>
                <th>Min</th>
                <th>Max</th>
                <th>Example values</th>
              </tr>
            </thead>
            <tbody>
              {cols.slice(0, 9).map((c) => (
                <ColumnSummaryRow
                  key={c.name}
                  column={c}
                  formatVal={formatVal}
                />
              ))}
            </tbody>
          </table>
        )}
      </div>
      <div className="mt-3 flex items-center justify-between">
        <span className="text-xs text-ink-500">
          {profile
            ? `Showing ${Math.min(cols.length, 9)} of ${formatNumber(cols.length)} columns`
            : "—"}
        </span>
        <Link
          to="./profile"
          className="inline-flex items-center gap-1 rounded-lg border border-ink-200 px-2.5 py-1 text-xs font-medium text-ink-700 hover:bg-ink-50"
        >
          View all columns
        </Link>
      </div>
    </Card>
  );
}

function ColumnSummaryRow({
  column,
  formatVal,
}: {
  column: DatasetProfileColumn;
  formatVal: (v: number | string | null | undefined) => string;
}) {
  const { metrics, name } = column;
  const minVal = metrics.numeric.min ?? metrics.temporal.min ?? null;
  const maxVal = metrics.numeric.max ?? metrics.temporal.max ?? null;
  const nullPct = metrics.null_rate * 100;
  const distinctPct = metrics.distinct_rate * 100;
  const typeLabel = metrics.physical_type;
  const isPk =
    name.toLowerCase().endsWith("_id") || name.toLowerCase() === "id";
  const examples = metrics.top_values
    .slice(0, 3)
    .map((t) => t.value)
    .join(", ");
  return (
    <tr>
      <td>
        <div className="flex items-center gap-2">
          <span
            className={cn(
              "grid h-5 w-5 place-items-center rounded text-ink-400",
              isPk ? "text-brand-500" : "",
            )}
          >
            <Hash className="h-3.5 w-3.5" />
          </span>
          <span className="font-medium text-ink-900">{name}</span>
        </div>
      </td>
      <td>
        <span className="inline-flex items-center rounded-md border border-ink-200 px-1.5 py-0.5 text-[11px] font-medium text-ink-700">
          {typeLabel}
        </span>
      </td>
      <td>
        <div className="flex items-center gap-2">
          <div className="relative h-1 w-16 overflow-hidden rounded-full bg-ink-100">
            <div
              className={cn(
                "h-full rounded-full",
                nullPct >= 10
                  ? "bg-gradient-to-r from-brand-300 to-brand-600"
                  : nullPct >= 1
                    ? "bg-gradient-to-r from-brand-300 to-brand-500"
                    : "bg-ink-300",
              )}
              style={{ width: `${Math.max(2, Math.min(100, nullPct))}%` }}
            />
          </div>
          <span className="tnum text-xs text-ink-700">
            {nullPct.toFixed(1)}%
          </span>
        </div>
      </td>
      <td className="tnum">{distinctPct.toFixed(1)}%</td>
      <td className="tnum font-mono text-xs">{formatVal(minVal)}</td>
      <td className="tnum font-mono text-xs">{formatVal(maxVal)}</td>
      <td className="font-mono text-xs text-ink-500" title={examples}>
        {examples || "—"}
      </td>
    </tr>
  );
}

/* ---------- Top findings ---------- */
function TopFindingsCard({ findings }: { findings: Finding[] }) {
  // Mirror the mockup: cap the overview card at the top five findings.
  // The full list lives on /datasets/{id}/findings, which the
  // "View all findings" link below already targets.
  const top = findings.slice(0, 5);
  return (
    <Card>
      <CardHeader
        eyebrow="Top findings"
        title="Highest-impact issues"
        action={
          <Link
            to="./findings"
            className="inline-flex items-center gap-1 rounded-lg border border-ink-200 px-2.5 py-1 text-xs font-medium text-ink-700 hover:bg-ink-50"
          >
            View all findings
          </Link>
        }
      />
      {top.length === 0 ? (
        <div className="mt-3">
          <EmptyState
            title="No findings yet"
            description="Run detection to surface quality issues."
          />
        </div>
      ) : (
        <ul className="mt-1 space-y-2">
          {top.map((f) => (
            <FindingRow key={f.finding_id} finding={f} />
          ))}
        </ul>
      )}
    </Card>
  );
}

function FindingRow({ finding }: { finding: Finding }) {
  const title = findingTitle(finding.kind, finding.column_name);
  const subline = findingSubline(finding.kind, finding.value, finding.threshold);
  return (
    /* Keep the entire severity rail inside the row's border. Its curved
       side faces the outer-left edge, while the content-facing side
       stays flat—the flipped treatment shown in the reference. */
    <li className="group relative overflow-hidden rounded-xl border border-ink-100 bg-white px-4 py-3.5 transition-colors hover:border-ink-200 hover:bg-ink-50/40">
      <span
        aria-hidden
        className={cn(
          "absolute bottom-px left-px top-px w-1 rounded-l-full",
          severityStripe(finding.severity),
        )}
      />
      <div className="flex items-center gap-3">
        <FindingIcon
          kind={finding.kind}
          severity={finding.severity}
          bare
          size={28}
        />
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-semibold text-ink-900">{title}</div>
          <div className="mt-0.5 truncate text-xs text-ink-500">{subline}</div>
        </div>
        <ImpactPill severity={finding.severity} />
      </div>
    </li>
  );
}

/* Severity → Tailwind background class for the row's left stripe. */
function severityStripe(severity: string): string {
  switch (severity.toLowerCase()) {
    case "critical":
      return "bg-red-500";
    case "high":
      return "bg-red-500";
    case "medium":
      return "bg-orange-500";
    case "low":
      return "bg-brand-500";
    case "info":
      return "bg-brand-500";
    default:
      return "bg-ink-300";
  }
}

function ImpactPill({ severity }: { severity: string }) {
  const sev = (severity ?? "").toLowerCase();
  const color =
    sev === "critical" || sev === "high"
      ? "text-sev-high"
      : sev === "medium"
        ? "text-sev-medium"
        : "text-sev-low";
  const label =
    sev === "critical" || sev === "high"
      ? "High"
      : sev === "medium"
        ? "Medium"
        : sev === "low" || sev === "info"
          ? "Low"
          : "—";
  return (
    <div className="shrink-0 text-right">
      <div className="text-[10px] font-medium uppercase tracking-wider text-ink-400">
        Impact
      </div>
      <div className={cn("text-xs font-bold", color)}>{label}</div>
    </div>
  );
}

/* ---------- Quality over time ---------- */
function QualityOverTimeCard({ datasetId }: { datasetId: string }) {
  const { data, isLoading, error } = useQuery({
    queryKey: ["scores", datasetId],
    queryFn: () => listScores(datasetId, 1, 30),
  });
  const [range, setRange] = useState<"7" | "14" | "30">("30");

  const series = useMemo(() => {
    const items = (data?.items ?? []).slice(0, 30).reverse();
    const slice = items.slice(-Number(range));
    return [
      {
        name: "Score",
        colour: "#5b6cff",
        values: slice.map((s, i) => ({
          x: shortDate(s.created_at),
          y: s.score,
          i,
        })),
      },
    ];
  }, [data, range]);

  const lastPoint = series[0].values[series[0].values.length - 1];
  const lastDate = lastPoint?.x ?? "";

  return (
    <Card>
      <CardHeader
        eyebrow="Quality over time"
        title="Score trend"
        action={<RangeDropdown value={range} onChange={setRange} />}
      />
      <div className="mt-2">
        {isLoading ? (
          <LoadingState label="Loading scores..." />
        ) : error ? (
          <EmptyState title="Unable to load scores" />
        ) : series[0].values.length === 0 ? (
          <EmptyState
            title="No scores yet"
            description="Run scoring to populate the trend."
          />
        ) : (
          <div className="relative">
            <QualityOverTimeChart data={series} height={200} yDomain={[0, 100]} />
            {lastPoint && (
              <div
                className="pointer-events-none absolute right-2 top-2 rounded-lg border border-ink-100 bg-white px-2.5 py-1.5 text-right shadow-card"
                style={{ minWidth: 80 }}
              >
                <div className="text-[10px] uppercase tracking-wider text-ink-500">
                  {lastDate}
                </div>
                <div className="text-sm font-semibold tnum text-ink-900">
                  {Math.round(lastPoint.y)}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </Card>
  );
}

function RangeDropdown({
  value,
  onChange,
}: {
  value: "7" | "14" | "30";
  onChange: (v: "7" | "14" | "30") => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="inline-flex items-center gap-1.5 rounded-lg border border-ink-200 px-2.5 py-1 text-xs font-medium text-ink-700 hover:bg-ink-50"
      >
        Last {value} days
        <ChevronDown className="h-3.5 w-3.5" />
      </button>
      {open && (
        <div
          className="absolute right-0 z-10 mt-1 w-32 rounded-lg border border-ink-100 bg-white py-1 shadow-card"
          onMouseLeave={() => setOpen(false)}
        >
          {(["7", "14", "30"] as const).map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => {
                onChange(v);
                setOpen(false);
              }}
              className={cn(
                "block w-full px-3 py-1.5 text-left text-xs hover:bg-ink-50",
                v === value ? "font-semibold text-ink-900" : "text-ink-700",
              )}
            >
              Last {v} days
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function shortDate(iso: string): string {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return "—";
  const d = new Date(t);
  const months = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
  ];
  return `${months[d.getMonth()]} ${d.getDate()}`;
}

/* ---------- AI interpretation ---------- */
function AIInterpretationCard({
  summary,
  likelyCause,
  confidence,
  detectedAt,
  sparkIcon,
}: {
  summary?: string;
  likelyCause?: string | null;
  confidence?: number;
  detectedAt?: string;
  sparkIcon?: boolean;
}) {
  return (
    <Card>
      <CardHeader
        eyebrow={
          <span className="inline-flex items-center gap-1.5">
            <Sparkles className="h-3.5 w-3.5" />
            AI interpretation
          </span>
        }
        title="What the model thinks"
        action={
          <button className="btn-secondary" type="button">
            <RotateCcw className="h-4 w-4" />
            <span>Regenerate</span>
          </button>
        }
      />
      <div className="mt-4 flex items-start gap-3">
        {sparkIcon && (
          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-brand-50 text-brand-600">
            <Sparkles className="h-4 w-4" />
          </span>
        )}
        <div className="min-w-0 flex-1">
          <p className="text-sm leading-6 text-ink-700">
            {summary ??
              "No interpretation yet. Run detection and scoring to populate this card."}
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <FootChip
              label="Likely cause"
              value={likelyCause ?? "Pipeline retry"}
              variant="blue"
            />
            <FootChip
              label="Confidence"
              value={
                confidence === undefined
                  ? "—"
                  : confidence >= 0.8
                    ? "High"
                    : confidence >= 0.5
                      ? "Medium"
                      : "Low"
              }
              variant="blue"
            />
            <FootChip
              label="Detected"
              value={detectedAt ? formatRelativeFromNow(detectedAt) : "—"}
              variant="muted"
            />
          </div>
        </div>
      </div>
    </Card>
  );
}

function FootChip({
  label,
  value,
  variant = "muted",
}: {
  label: string;
  value: string;
  variant?: "blue" | "muted";
}) {
  const cls =
    variant === "blue"
      ? "bg-brand-50 text-brand-700"
      : "bg-ink-50 text-ink-700";
  return (
    <span className="inline-flex items-center gap-1.5 rounded-md px-1.5 py-0.5 text-xs">
      <span className={cn("rounded-md px-1.5 py-0.5 text-[11px] font-medium", cls)}>
        {label}
      </span>
      <span className="font-medium text-ink-900">{value}</span>
    </span>
  );
}
