import { Routes, Route, Navigate } from "react-router-dom";

import { AppShell } from "@/components/layout/AppShell";
import { OverviewPage } from "@/pages/OverviewPage";
import { DatasetsPage } from "@/pages/DatasetsPage";
import { DatasetUploadPage } from "@/pages/DatasetUploadPage";
import { DatasetDetailPage } from "@/pages/DatasetDetailPage";
import { DatasetOverviewTab } from "@/pages/tabs/DatasetOverviewTab";
import { DatasetProfileTab } from "@/pages/tabs/DatasetProfileTab";
import { DatasetFindingsTab } from "@/pages/tabs/DatasetFindingsTab";
import { DatasetQualityTab } from "@/pages/tabs/DatasetQualityTab";
import { DatasetRecommendationsTab } from "@/pages/tabs/DatasetRecommendationsTab";
import { DatasetHistoryTab } from "@/pages/tabs/DatasetHistoryTab";
import { JobsPage } from "@/pages/JobsPage";
import { QualityPage } from "@/pages/QualityPage";
import { FindingsPage } from "@/pages/FindingsPage";
import { RecommendationsPage } from "@/pages/RecommendationsPage";
import { AIPage } from "@/pages/AIPage";
import { HistoryPage } from "@/pages/HistoryPage";
import { LineagePage } from "@/pages/LineagePage";
import { LimitsPage } from "@/pages/LimitsPage";

export default function App() {
  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route path="/" element={<OverviewPage />} />
        <Route path="/datasets" element={<DatasetsPage />} />
        <Route path="/datasets/new" element={<DatasetUploadPage />} />
        <Route path="/datasets/:datasetId" element={<DatasetDetailPage />}>
          <Route index element={<DatasetOverviewTab />} />
          <Route path="profile" element={<DatasetProfileTab />} />
          <Route path="findings" element={<DatasetFindingsTab />} />
          <Route path="quality" element={<DatasetQualityTab />} />
          <Route path="recommendations" element={<DatasetRecommendationsTab />} />
          <Route path="history" element={<DatasetHistoryTab />} />
        </Route>
        <Route path="/jobs" element={<JobsPage />} />
        <Route path="/quality" element={<QualityPage />} />
        <Route path="/findings" element={<FindingsPage />} />
        <Route path="/recommendations" element={<RecommendationsPage />} />
        <Route path="/ai" element={<AIPage />} />
        <Route path="/history" element={<HistoryPage />} />
        <Route path="/lineage" element={<LineagePage />} />
        <Route path="/limits" element={<LimitsPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
