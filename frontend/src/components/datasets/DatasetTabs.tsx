import { NavLink } from 'react-router-dom'

interface DatasetTab {
  label: string
  to: string
}

const DATASET_TABS: ReadonlyArray<DatasetTab> = [
  { label: 'Overview', to: '' },
  { label: 'Profile', to: 'profile' },
  { label: 'Findings', to: 'findings' },
  { label: 'History', to: 'history' },
  { label: 'AI', to: 'ai' },
  { label: 'Recommendations', to: 'recommendations' },
  { label: 'Jobs', to: 'jobs' },
]

export function DatasetTabs({ datasetId }: { datasetId: string }) {
  return (
    <nav
      aria-label="Dataset sections"
      className="flex flex-wrap items-center gap-x-1 gap-y-1 border-b border-line"
    >
      {DATASET_TABS.map(({ label, to }) => (
        <NavLink
          className={({ isActive }) =>
            `relative -mb-px border-b-2 px-3 py-2.5 text-sm transition-colors ${
              isActive
                ? 'border-accent text-ink font-medium'
                : 'border-transparent text-ink-soft hover:text-ink'
            }`
          }
          end={to === ''}
          key={to || 'overview'}
          to={`/datasets/${datasetId}/${to}`}
        >
          {label}
        </NavLink>
      ))}
    </nav>
  )
}
