import Link from 'next/link'
import { ProjectsTable } from '@/components/projects/projects-table'
import { Shell } from '@/components/shell/shell'
import { Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbSeparator } from '@/components/ui/breadcrumb'

export default function HomePage() {
  return (
    <Shell>
      <Breadcrumb className="mb-4">
        <BreadcrumbItem><BreadcrumbLink href="/">Dashboard</BreadcrumbLink></BreadcrumbItem>
      </Breadcrumb>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-semibold">Projects</h1>
      </div>
      <ProjectsTable />
    </Shell>
  )
}
