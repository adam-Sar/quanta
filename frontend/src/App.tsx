import { Route, Routes } from 'react-router-dom'

import { AppShell } from './components/layout/AppShell'
import { DatasetAIAnalysisPage } from './pages/DatasetAIAnalysisPage'
import { DatasetFindingsPage } from './pages/DatasetFindingsPage'
import { DatasetHistoryPage } from './pages/DatasetHistoryPage'
import { DatasetJobsPage } from './pages/DatasetJobsPage'
import { DatasetOverviewPage } from './pages/DatasetOverviewPage'
import { DatasetProfilingPage } from './pages/DatasetProfilingPage'
import { DatasetRecommendationsPage } from './pages/DatasetRecommendationsPage'
import { DatasetResourcePage } from './pages/DatasetResourcePage'
import { DatasetValidationsPage } from './pages/DatasetValidationsPage'
import { DatasetsPage } from './pages/DatasetsPage'
import { JobsPage } from './pages/JobsPage'
import { OverviewPage } from './pages/OverviewPage'
import { SettingsPage } from './pages/SettingsPage'

export function App() {
  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route element={<OverviewPage />} path="/" />
        <Route element={<DatasetsPage />} path="/datasets" />
        <Route element={<DatasetOverviewPage />} path="/datasets/:datasetId" />
        <Route element={<DatasetProfilingPage />} path="/datasets/:datasetId/profile" />
        <Route element={<DatasetFindingsPage />} path="/datasets/:datasetId/findings" />
        <Route element={<DatasetHistoryPage />} path="/datasets/:datasetId/history" />
        <Route element={<DatasetAIAnalysisPage />} path="/datasets/:datasetId/ai" />
        <Route element={<DatasetRecommendationsPage />} path="/datasets/:datasetId/recommendations" />
        <Route
          element={<DatasetValidationsPage />}
          path="/datasets/:datasetId/recommendations/:recommendationId/validations"
        />
        <Route element={<DatasetJobsPage />} path="/datasets/:datasetId/jobs" />
        <Route element={<DatasetResourcePage />} path="/datasets/:datasetId/source" />
        <Route element={<JobsPage />} path="/jobs" />
        <Route element={<SettingsPage />} path="/settings" />
      </Route>
    </Routes>
  )
}
