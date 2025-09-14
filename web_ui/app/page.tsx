import Link from 'next/link'
import { ProjectsList } from '@/components/projects/projects-list'
import { Shell } from '@/components/shell/shell'

export default function HomePage() {
  return (
    <Shell>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-semibold">Projects</h1>
        <Link href="#" className="text-sm text-muted-foreground hover:underline">New project</Link>
      </div>
      <ProjectsList />
    </Shell>
  )
}

