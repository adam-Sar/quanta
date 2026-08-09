import { useState } from "react";
import { useNavigate } from "react-router-dom";

import { Topbar } from "@/components/layout/Topbar";
import { Card, CardHeader } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/PageHeader";
import { UploadDatasetModal } from "@/components/datasets/UploadDatasetModal";

export function DatasetUploadPage() {
  const navigate = useNavigate();
  const [open, setOpen] = useState(true);

  return (
    <>
      <Topbar crumbs={[{ label: "Datasets", to: "/datasets" }, { label: "New dataset" }]} />
      <PageHeader
        title="Upload a new dataset"
        description="Drop a CSV/Parquet file. The backend will finger-print it, store it deterministically, and chain a lineage edge from the previous version of the same name."
      />
      <div className="p-6">
        <Card>
          <CardHeader
            eyebrow="Upload"
            title="Choose a file"
            description="The upload modal supports drag-and-drop and a manual file picker."
          />
          <div className="mt-4">
            <button className="btn-primary" onClick={() => setOpen(true)}>
              Open upload
            </button>
          </div>
        </Card>
      </div>
      <UploadDatasetModal
        open={open}
        onClose={() => setOpen(false)}
        onSubmit={() => navigate("/datasets")}
        isSubmitting={false}
        error={null}
      />
    </>
  );
}
