import { useOutletContext } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";

import { Card, CardHeader } from "@/components/ui/Card";
import { EmptyState, LoadingState } from "@/components/ui/States";
import { getLineage } from "@/api/history";
import { formatRelativeFromNow } from "@/lib/utils";
import type { Dataset } from "@/types/api";

interface Ctx { dataset: Dataset; }

export function DatasetHistoryTab() {
  const { dataset } = useOutletContext<Ctx>();
  const { data, isLoading } = useQuery({
    queryKey: ["lineage", dataset.id],
    queryFn: () => getLineage(dataset.id),
  });

  return (
    <Card>
      <CardHeader
        eyebrow="Lineage"
        title="Version chain"
        description="Deterministic lineage between immutable versions of this dataset."
      />
      <div className="mt-4">
        {isLoading ? (
          <LoadingState label="Loading lineage…" />
        ) : !data || data.edges.length === 0 ? (
          <EmptyState
            title="No lineage yet"
            description="Upload a new version of this dataset to populate the lineage."
          />
        ) : (
          <ol className="relative ml-3 border-l border-ink-200 pl-5">
            {data.edges.map((e) => (
              <li key={e.from_version_id + e.to_version_id} className="mb-6">
                <span className="absolute -left-1.5 mt-1 h-3 w-3 rounded-full bg-brand-500" />
                <div className="text-sm font-medium text-ink-900">
                  v{e.from_version_number} → v{e.to_version_number}
                </div>
                <div className="text-xs text-ink-500">
                  {e.relationship} · {formatRelativeFromNow(new Date().toISOString())}
                </div>
              </li>
            ))}
            {data.edges.length === 0 && (
              <li>
                <span className="absolute -left-1.5 mt-1 h-3 w-3 rounded-full bg-ink-200" />
                <div className="text-sm text-ink-500">v1 of the dataset</div>
              </li>
            )}
          </ol>
        )}
      </div>
    </Card>
  );
}
