import { ArrowLeft, CircleDashed } from 'lucide-react'
import { Link } from 'react-router-dom'

import { Button } from '../components/ui/Button'
import { PageHeader } from '../components/ui/PageHeader'
import { Panel } from '../components/ui/Panel'

interface PlaceholderPageProps {
  title: string
  description: string
  task: string
}

export function PlaceholderPage({ title, description, task }: PlaceholderPageProps) {
  return (
    <div className="space-y-8">
      <PageHeader description={description} eyebrow="Surface staged" title={title} />
      <Panel className="max-w-2xl border-l-2 border-l-line">
        <span className="flex h-10 w-10 items-center justify-center rounded-md border border-line bg-elevated text-muted">
          <CircleDashed aria-hidden="true" size={19} strokeWidth={1.6} />
        </span>
        <h2 className="mt-5 text-lg font-semibold text-ink">This surface is intentionally quiet</h2>
        <p className="mt-2 max-w-xl text-sm leading-6 text-muted">
          The foundation task establishes navigation without inventing a dataset workflow. {task} will connect this route to the backend contract in its dedicated milestone.
        </p>
        <Link className="mt-6 inline-flex" to="/">
          <Button size="sm" variant="secondary">
            <ArrowLeft aria-hidden="true" size={14} />
            Return to overview
          </Button>
        </Link>
      </Panel>
    </div>
  )
}
