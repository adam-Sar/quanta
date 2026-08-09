import { useOutletContext } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2, Play, Sparkles } from "lucide-react";

import { Card, CardHeader } from "@/components/ui/Card";
import { ScoreRing } from "@/components/ui/ScoreRing";
import { ProgressBar } from "@/components/ui/ProgressBar";
import { EmptyState, ErrorState } from "@/components/ui/States";
import { QualityOverTimeChart } from "@/components/ui/LineChart";
import { listScores, runScore } from "@/api/scores";
import { formatNumber, formatPercent, formatRelativeFromNow } from "@/lib/utils";
import type { Dataset, QualityScore } from "@/types/api";

interface Ctx {
  dataset: Dataset;
  score?: QualityScore;
}

export function DatasetQualityTab() {
  const { dataset, score } = useOutletContext<Ctx>();
  const qc = useQueryClient();

  const allScores = useQuery({
    queryKey: ["scores", dataset.id],
    queryFn: () => listScores(dataset.id, 1, 50),
  });

  const compute = useMutation({
    mutationFn: () => runScore(dataset.id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["scores", dataset.id] });
      qc.invalidateQueries({ queryKey: ["score", dataset.id] });
    },
  });

  const series = [
    {
      name: "Score",
      colour: "#5b6cff",
      values: (allScores.data?.items ?? []).slice(0, 30).reverse().map((s, i) => ({ x: `D${i + 1}`, y: s.score })),
    },
  ];

  const cf = score?.components;
  const byColumn = cf ? Object.entries(cf.by_column).sort((a, b) => b[1].penalty_total - a[1].penalty_total).slice(0, 8) : [];

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
      <Card className="lg:col-span-1">
        <CardHeader
          eyebrow="Quality"
          title="Latest score"
          description={score ? `Created ${formatRelativeFromNow(score.created_at)}` : "No score yet"}
          action={
            <button className="btn-primary" onClick={() => compute.mutate()} disabled={compute.isPending}>
              {compute.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
              <span>{compute.isPending ? "Running…" : "Run scoring"}</span>
            </button>
          }
        />
        {compute.error && <div className="mt-3"><ErrorState error={compute.error} title="Scoring failed" /></div>}
        <div className="mt-4 flex items-center gap-4">
          <ScoreRing score={score?.score ?? 0} size={120} stroke={10} />
          <div>
            <div className="text-2xl font-semibold tnum">{score?.score.toFixed(0) ?? "—"}</div>
            <div className="text-sm text-ink-500">Grade {score?.grade ?? "—"}</div>
            <div className="mt-2 text-xs text-ink-500">{formatNumber(score?.finding_count)} findings</div>
          </div>
        </div>
      </Card>

      <Card className="lg:col-span-2">
        <CardHeader
          eyebrow="Trend"
          title="Score over the last runs"
          description="Lower bars indicate runs without a score yet."
        />
        <div className="mt-2">
          {series[0].values.length ? (
            <QualityOverTimeChart data={series} height={220} yDomain={[0, 100]} />
          ) : (
            <EmptyState title="No score runs yet" description="Run scoring to populate the trend." />
          )}
        </div>
      </Card>

      <Card className="lg:col-span-2">
        <CardHeader
          eyebrow="Breakdown"
          title="Where the penalties come from"
          description="Top 8 columns by penalty contribution."
        />
        <div className="mt-4 space-y-3">
          {byColumn.length === 0 ? (
            <EmptyState title="No breakdown yet" description="Run scoring to populate the breakdown." />
          ) : (
            byColumn.map(([col, b]) => (
              <div key={col} className="grid grid-cols-12 items-center gap-3">
                <div className="col-span-3 font-mono text-xs text-ink-700">{col}</div>
                <div className="col-span-7">
                  <ProgressBar value={Math.min(1, b.penalty_normalized)} variant="severity" />
                </div>
                <div className="col-span-2 text-right tnum text-sm text-ink-700">
                  {b.penalty_total.toFixed(1)}
                </div>
              </div>
            ))
          )}
        </div>
      </Card>

      <Card>
        <CardHeader
          eyebrow="Compose"
          title="Severity mix"
          description="Findings contributing to the score, by severity."
        />
        <div className="mt-4 space-y-2">
          {Object.entries(cf?.by_severity ?? {}).map(([sev, b]) => (
            <div key={sev} className="flex items-center justify-between text-sm">
              <span className="capitalize text-ink-700">{sev}</span>
              <span className="tnum text-ink-900">{formatNumber(b.count)} <span className="text-ink-500">· {formatPercent(b.penalty_normalized)}</span></span>
            </div>
          ))}
        </div>
        <div className="mt-4 flex items-center gap-2 text-xs text-ink-500">
          <Sparkles className="h-3.5 w-3.5" />
          <span>Formula {score?.formula_version ?? "—"}</span>
        </div>
      </Card>
    </div>
  );
}
