import { Route, Routes } from 'react-router-dom'

import { AppShell } from './components/layout/AppShell'
import { OverviewPage } from './pages/OverviewPage'
import { PlaceholderPage } from './pages/PlaceholderPage'

export function App() {
  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route element={<OverviewPage />} path="/" />
        <Route
          element={
            <PlaceholderPage
              description="Inspect source inventory, immutable versions, and ingestion state."
              task="The dataset explorer task"
              title="Datasets"
            />
          }
          path="/datasets"
        />
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
