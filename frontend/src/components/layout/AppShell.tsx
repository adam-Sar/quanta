import { BriefcaseBusiness, Database, LayoutDashboard, Settings2 } from 'lucide-react'
import { useState } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'

import { getReadiness } from '../../api/health'
import { Sidebar, type NavigationItem } from './Sidebar'
import { Topbar } from './Topbar'

const navigationItems: NavigationItem[] = [
  { label: 'Overview', to: '/', icon: LayoutDashboard },
  { label: 'Datasets', to: '/datasets', icon: Database },
  { label: 'Jobs', to: '/jobs', icon: BriefcaseBusiness },
  { label: 'Settings', to: '/settings', icon: Settings2 },
]

function getPageTitle(pathname: string): string {
  if (pathname.startsWith('/datasets')) return 'Datasets'
  if (pathname.startsWith('/jobs')) return 'Jobs'
  if (pathname.startsWith('/settings')) return 'Settings'
  return 'Overview'
}

export function AppShell() {
  const location = useLocation()
  const [mobileNavOpen, setMobileNavOpen] = useState(false)
  const readinessQuery = useQuery({
    queryKey: ['health', 'readiness'],
    queryFn: getReadiness,
    refetchInterval: 30_000,
    retry: 1,
    staleTime: 10_000,
  })
  const serviceState = readinessQuery.isSuccess ? 'ready' : readinessQuery.isError ? 'degraded' : 'checking'

  return (
    <div className="min-h-screen bg-canvas text-ink">
      <div className="flex min-h-screen">
        <Sidebar
          isOpen={mobileNavOpen}
          items={navigationItems}
          onNavigate={() => setMobileNavOpen(false)}
          serviceState={serviceState}
        />
        <div className="flex min-w-0 flex-1 flex-col">
          <Topbar onMenuClick={() => setMobileNavOpen(true)} title={getPageTitle(location.pathname)} />
          <main className="flex-1">
            <div className="mx-auto w-full max-w-[1440px] px-4 py-7 sm:px-6 sm:py-8 lg:px-10 lg:py-10">
              <Outlet />
            </div>
          </main>
        </div>
      </div>
    </div>
  )
}
