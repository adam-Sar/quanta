import { useOutletContext } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Check, FlaskConical, Loader2, Sparkles } from "lucide-react";

import { Card, CardHeader } from "@/components/ui/Card";
import { SeverityText } from "@/components/ui/Badge";
import { EmptyState, ErrorState, LoadingState } from "@/components/ui/States";
import { listRecommendations, runRecommendations } from "@/api/recommendations";
import { runValidation } from "@/api/findings";
import { formatNumber, formatPercent, kindLabel } from "@/lib/utils";
import type { Dataset, Recommendation } from "@/types/api";

interface Ctx { dataset: Dataset; }

export function DatasetRecommendationsTab() {
  const { dataset } = useOutletContext<Ctx>();
  const qc = useQueryClient();

  const { data, isLoading, error } = useQuery({
    queryKey: ["recs", dataset.id],
    queryFn: () => listRecommendations(dataset.id, 1, 50),
  });

  const compute = useMutation({
    mutationFn: () => runRecommendations(dataset.id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["recs", dataset.id] }),
  });

  const validate = useMutation({
    mutationFn: (recId: string) => runValidation(dataset.id, recId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["recs", dataset.id] }),
  });

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader
          eyebrow="Recommendations"
          title="Suggested fixes"
          description="Deterministic, preview-only rules. Apply is disabled until validation succeeds."
          action={
            <button className="btn-primary" onClick={() => compute.mutate()} disabled={compute.isPending}>
              {compute.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
              <span>{compute.isPending ? "Running…" : "Generate recommendations"}</span>
            </button>
          }
        />
        {compute.error && <div className="mt-3"><ErrorState error={compute.error} title="Recommendations failed" /></div>}

        <div className="mt-4">
          {isLoading ? (
            <LoadingState label="Loading recommendations…" />
          ) : error ? (
            <ErrorState error={error} />
          ) : (data?.items.length ?? 0) === 0 ? (
            <EmptyState
              title="No recommendations yet"
              description="Generate recommendations to surface preview-only operations."
            />
          ) : (
            <div className="space-y-3">
              {data!.items.map((r) => (
                <RecommendationRow
                  key={r.recommendation_id}
                  rec={r}
                  onValidate={() => validate.mutate(r.recommendation_id)}
                  validating={validate.isPending && validate.variables === r.recommendation_id}
                />
              ))}
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}

function RecommendationRow({
  rec,
  onValidate,
  validating,
}: {
  rec: Recommendation;
  onValidate: () => void;
  validating: boolean;
}) {
  return (
    <div className="rounded-2xl border border-ink-100 p-4 transition-shadow hover:shadow-card">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-ink-900">{rec.title}</span>
            <SeverityText severity={rec.severity} />
            <span className="text-[11px] uppercase tracking-wider text-ink-500">{kindLabel(rec.kind)}</span>
          </div>
          <p className="mt-1 text-sm text-ink-600">{rec.rationale}</p>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-ink-500">
            <span>Columns: {rec.affected_columns.join(", ") || "—"}</span>
            <span className="text-ink-300">·</span>
            <span>Confidence {formatPercent(rec.confidence)}</span>
            <span className="text-ink-300">·</span>
            <span>Priority {formatNumber(rec.priority)}</span>
          </div>
        </div>
        <div className="flex flex-col items-end gap-2">
          <button
            className="btn-secondary"
            onClick={onValidate}
            disabled={validating}
          >
            {validating ? <Loader2 className="h-4 w-4 animate-spin" /> : <FlaskConical className="h-4 w-4" />}
            <span>Validate</span>
          </button>
          <button className="btn-ghost text-ink-400" disabled>
            <Check className="h-4 w-4" />
            <span>Apply (preview-only)</span>
          </button>
        </div>
      </div>
    </div>
  );
}
