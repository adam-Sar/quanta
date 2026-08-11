import { useState } from "react";
import { useNavigate } from "react-router-dom";

import { Topbar } from "@/components/layout/Topbar";
import { PageHeader } from "@/components/ui/PageHeader";
import { UploadDatasetModal } from "@/components/datasets/UploadDatasetModal";

export function DatasetUploadPage() {
  const navigate = useNavigate();
  const [open, setOpen] = useState(true);

  return (
    <>
      <Topbar
        crumbs={[
          { label: "Datasets", to: "/datasets" },
          { label: "New dataset" },
        ]}
      />
      <PageHeader
        title="New dataset"
        description="Drop a CSV or Parquet file. The first version is created automatically."
      />
      <UploadDatasetModal
        open={open}
        onClose={() => {
          setOpen(false);
          navigate("/datasets");
        }}
        onSubmit={() => navigate("/datasets")}
        isSubmitting={false}
        error={null}
      />
    </>
  );
}
