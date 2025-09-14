"use client"

import { useQuery } from '@tanstack/react-query'
import { api, type Project } from '@/lib/api'
import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { formatDateTime } from '@/lib/utils'

export function ProjectsList() {
  const { data, isLoading, error } = useQuery({ queryKey: ['projects'], queryFn: api.projects.list })

  if (isLoading) return <div>Loading projects...</div>
  if (error) return <div className="text-red-600">Failed to load projects</div>

  if (!data || data.length === 0) {
    return <div className="text-muted-foreground">No projects found.</div>
  }

  return (
    <div className="grid gap-4 grid-cols-1 md:grid-cols-2 xl:grid-cols-3">
      {data.map((p) => (
        <ProjectCard key={p.id} project={p} />
      ))}
    </div>
  )
}

function ProjectCard({ project }: { project: Project }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <Link href={`/projects/${project.id}`} className="hover:underline">{project.name}</Link>
          <span className="text-xs text-muted-foreground">{formatDateTime(project.created_at)}</span>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground line-clamp-3">{project.description || '—'}</p>
      </CardContent>
    </Card>
  )
}
