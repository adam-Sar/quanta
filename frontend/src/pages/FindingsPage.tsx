import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";

import { Topbar } from "@/components/layout/Topbar";
import { Card, CardHeader } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/PageHeader";
import { SeverityText } from "@/components/ui/Badge";
import { SearchInput } from "@/components/ui/SearchInput";
import { EmptyState, LoadingState } from "@/components/ui/States";
import { listDatasets } from "@/api/datasets";
import { listFindings } from "@/api/findings";
import { kindLabel } from "@/lib/utils";

export function FindingsPage() {
  const { data: datasets } = useQuery({
    queryKey: ["datasets", { page: 1, page_size: 50 }],
    queryFn: () => listDatasets({ page: 1, page_size: 50 }),
  });

  const [search, setSearch] = useState("");
  const [sev, setSev] = useState<string | null>(null);

  return (
    <>
      <Topbar crumbs={[{ label: "Findings" }]} />
      <PageHeader
        title="Findings"
        description="Cross-dataset, severity-aware view of all detection findings."
      />
      <div className="p-6">
        <Card>
          <CardHeader
            eyebrow="Browse"
            title="All findings"
            description="Filter by severity, search descriptions, or click through to a dataset."
          />
          <div className="mt-4 flex items-center gap-2">
            <SearchInput
              value={search}
              onChange={setSearch}
              placeholder="Search findings…"
              className="max-w-xs"
            />
            <div className="flex items-center gap-1">
              {["critical", "high", "medium", "low", "info"].map((s) => (
                <button
                  key={s}
                  onClick={() => setSev(sev === s ? null : s)}
                  className={`rounded-md px-2 py-1 text-xs font-medium capitalize transition-colors ${
                    sev === s ? "bg-ink-900 text-white" : "bg-ink-50 text-ink-700 hover:bg-ink-100"
                  }`}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
          <div className="mt-4 -mx-5">
            {!datasets ? (
              <LoadingState label="Loading datasets…" />
            ) : datasets.items.length === 0 ? (
              <EmptyState title="No datasets yet" description="Upload a dataset to see findings." />
            ) : (
              <div className="space-y-1">
                {datasets.items.map((d) => (
                  <DatasetFindingsSection
                    key={d.id}
                    datasetId={d.id}
                    name={d.name}
                    search={search}
                    sev={sev}
                  />
                ))}
              </div>
            )}
          </div>
        </Card>
      </div>
    </>
  );
}

function DatasetFindingsSection({
  datasetId,
  name,
  search,
  sev,
}: {
  datasetId: string;
  name: string;
  search: string;
  sev: string | null;
}) {
  const { data, isLoading } = useQuery({
    queryKey: ["findings", datasetId],
    queryFn: () => listFindings(datasetId, 1, 20),
  });
  const items = useMemo(() => {
    const list = data?.items ?? [];
    return list.filter((f) => {
      if (sev && f.severity !== sev) return false;
      if (search && !`${f.description} ${f.column_name ?? ""}`.toLowerCase().includes(search.toLowerCase())) return false;
      return true;
    });
  }, [data, search, sev]);
  if (isLoading) return <div className="px-5 py-3 text-sm text-ink-500">Loading {name}…</div>;
  if (items.length === 0) return null;
  return (
    <div className="px-5 py-3">
      <div className="mb-2 flex items-center justify-between">
        <Link to={`/datasets/${datasetId}/findings`} className="text-sm font-medium text-ink-900 hover:text-brand-600">
          {name}
        </Link>
        <span className="text-xs text-ink-500">{items.length} shown</span>
      </div>
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
              <td><SeverityText severity={f.severity} /></td>
              <td className="font-mono text-xs">{f.column_name ?? "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
