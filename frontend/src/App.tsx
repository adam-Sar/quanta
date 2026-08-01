import { Route, Routes } from 'react-router-dom'

import { AppShell } from './components/layout/AppShell'
import { DatasetFindingsPage } from './pages/DatasetFindingsPage'
import { DatasetHistoryPage } from './pages/DatasetHistoryPage'
import { DatasetOverviewPage } from './pages/DatasetOverviewPage'
import { DatasetProfilingPage } from './pages/DatasetProfilingPage'
import { DatasetResourcePage } from './pages/DatasetResourcePage'
import { DatasetsPage } from './pages/DatasetsPage'
import { OverviewPage } from './pages/OverviewPage'
import { PlaceholderPage } from './pages/PlaceholderPage'

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
        <Route element={<DatasetResourcePage />} path="/datasets/:datasetId/source" />
        <Route
          element={
            <PlaceholderPage
              description="Review durable analysis runs and their auditable outcomes."
              task="The Jobs task"
              title="Jobs"
            />
          }
          path="/jobs"
        />
        <Route
          element={
            <PlaceholderPage
              description="Runtime limits, API diagnostics, and future workspace controls."
              task="A future operator settings task"
              title="Settings"
            />
          }
          path="/settings"
        />
      </Route>
    </Routes>
  )
}
