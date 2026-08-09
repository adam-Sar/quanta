import { useQuery } from "@tanstack/react-query";

import { Topbar } from "@/components/layout/Topbar";
import { Card, CardHeader } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/PageHeader";
import { EmptyState, ErrorState, LoadingState } from "@/components/ui/States";
import { getLimits } from "@/api/ops";

export function LimitsPage() {
  const { data, isLoading, error } = useQuery({
    queryKey: ["limits"],
    queryFn: () => getLimits(),
  });

  return (
    <>
      <Topbar crumbs={[{ label: "Limits" }]} />
      <PageHeader
        title="Limits"
        description="Per-environment ceilings surfaced by the backend. Updates land here without a frontend change."
      />
      <div className="p-6">
        <Card>
          <CardHeader
            eyebrow="Configuration"
            title="Effective limits"
            description="Read-only. Edit on the backend, then re-query."
          />
          <div className="mt-4">
            {isLoading ? (
              <LoadingState label="Loading limits…" />
            ) : error ? (
              <ErrorState error={error} />
            ) : !data ? (
              <EmptyState title="No limits returned" />
            ) : (
              <ul className="divide-y divide-ink-100">
                {Object.entries(data).map(([key, value]) => (
                  <li key={key} className="flex items-center justify-between py-3">
                    <span className="font-mono text-xs text-ink-700">{key}</span>
                    <span className="tnum text-sm text-ink-900">{String(value)}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </Card>
      </div>
    </>
  );
}
