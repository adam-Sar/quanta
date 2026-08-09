import { useState } from "react";
import { useOutletContext } from "react-router-dom";
import { Loader2, Play } from "lucide-react";

import { Card, CardHeader } from "@/components/ui/Card";
import { SeverityText } from "@/components/ui/Badge";
import { SearchInput } from "@/components/ui/SearchInput";
import { EmptyState, ErrorState, LoadingState } from "@/components/ui/States";
import { runDetection } from "@/api/findings";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { kindLabel } from "@/lib/utils";
import type { Dataset, FindingListResponse } from "@/types/api";

interface Ctx {
  dataset: Dataset;
  findings?: FindingListResponse;
}

export function DatasetFindingsTab() {
  const { dataset, findings } = useOutletContext<Ctx>();
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [sevFilter, setSevFilter] = useState<string | null>(null);

  const run = useMutation({
    mutationFn: () => runDetection(dataset.id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["findings", dataset.id] });
    },
  });

  const filtered = (findings?.items ?? []).filter((f) => {
    if (sevFilter && f.severity !== sevFilter) return false;
    if (search && !`${f.description} ${f.column_name ?? ""}`.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader
          eyebrow="Findings"
          title="All detection findings"
          description={`${findings?.pagination.total_items ?? 0} total`}
          action={
            <button
              className="btn-primary"
              onClick={() => run.mutate()}
              disabled={run.isPending}
            >
              {run.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
              <span>{run.isPending ? "Running…" : "Run detection"}</span>
            </button>
          }
        />

        {run.error && <div className="mt-3"><ErrorState error={run.error} title="Detection failed" /></div>}

        <div className="mt-4 flex items-center gap-2">
          <SearchInput value={search} onChange={setSearch} placeholder="Search findings…" className="max-w-xs" />
          <div className="flex items-center gap-1">
            {["critical", "high", "medium", "low", "info"].map((s) => (
              <button
                key={s}
                onClick={() => setSevFilter(sevFilter === s ? null : s)}
                className={`rounded-md px-2 py-1 text-xs font-medium capitalize transition-colors ${
                  sevFilter === s ? "bg-ink-900 text-white" : "bg-ink-50 text-ink-700 hover:bg-ink-100"
                }`}
              >
                {s}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-4 -mx-5">
          {!findings ? (
            <LoadingState label="Loading findings…" />
          ) : filtered.length === 0 ? (
            <EmptyState
              title="No findings match"
              description="Try clearing the search or severity filter."
            />
          ) : (
            <table className="data-table">
              <thead>
                <tr>
                  <th>Description</th>
                  <th>Kind</th>
                  <th>Severity</th>
                  <th>Column</th>
                  <th>Value</th>
                  <th>Threshold</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((f) => (
                  <tr key={f.finding_id}>
                    <td className="font-medium text-ink-900">{f.description}</td>
                    <td className="text-ink-500">{kindLabel(f.kind)}</td>
                    <td><SeverityText severity={f.severity} /></td>
                    <td className="font-mono text-xs">{f.column_name ?? "—"}</td>
                    <td className="tnum">{f.value.toFixed(2)}</td>
                    <td className="tnum text-ink-500">{f.threshold.toFixed(2)}</td>
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
