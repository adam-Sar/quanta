import { useOutletContext } from "react-router-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2, Play } from "lucide-react";

import { Card, CardHeader } from "@/components/ui/Card";
import { EmptyState, ErrorState } from "@/components/ui/States";
import { Badge } from "@/components/ui/Badge";
import { createDatasetProfile } from "@/api/profiles";
import { formatNumber, formatRelativeFromNow } from "@/lib/utils";
import type { Dataset, DatasetProfile } from "@/types/api";

interface Ctx {
  dataset: Dataset;
  profile?: DatasetProfile;
}

export function DatasetProfileTab() {
  const { dataset, profile } = useOutletContext<Ctx>();
  const qc = useQueryClient();

  const refresh = useMutation({
    mutationFn: () => createDatasetProfile(dataset.id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["profile", dataset.id] });
      qc.invalidateQueries({ queryKey: ["profiles", dataset.id] });
    },
  });

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader
          eyebrow="Profile"
          title="Latest column profile"
          description={
            profile
              ? `Sampled ${formatNumber(profile.sample_size)} rows · ${profile.sampled === "sampled" ? "Sampled" : "Full"} · ${formatRelativeFromNow(profile.completed_at)}`
              : "Run profiling to capture per-column metrics."
          }
          action={
            <button
              className="btn-primary"
              onClick={() => refresh.mutate()}
              disabled={refresh.isPending}
            >
              {refresh.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Play className="h-4 w-4" />
              )}
              <span>{refresh.isPending ? "Running…" : "Run profile"}</span>
            </button>
          }
        />

        {refresh.error && (
          <div className="mt-3">
            <ErrorState error={refresh.error} title="Profile failed" />
          </div>
        )}

        <div className="mt-4">
          {!profile ? (
            <EmptyState
              title="Not yet profiled"
              description="Click Run profile to compute per-column metrics on the latest version."
            />
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
                  <th>Mean</th>
                  <th>Std</th>
                </tr>
              </thead>
              <tbody>
                {profile.columns.map((c) => (
                  <tr key={c.name}>
                    <td className="font-medium text-ink-900">{c.name}</td>
                    <td><Badge>{c.metrics.physical_type}</Badge></td>
                    <td className="tnum">{(c.metrics.null_rate * 100).toFixed(2)}%</td>
                    <td className="tnum">{(c.metrics.distinct_rate * 100).toFixed(2)}%</td>
                    <td className="tnum font-mono text-xs">{formatNumber(c.metrics.numeric.min)}</td>
                    <td className="tnum font-mono text-xs">{formatNumber(c.metrics.numeric.max)}</td>
                    <td className="tnum font-mono text-xs">{formatNumber(c.metrics.numeric.mean)}</td>
                    <td className="tnum font-mono text-xs">{formatNumber(c.metrics.numeric.std)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </Card>
    </div>
  );
}
