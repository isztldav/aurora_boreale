"use client"

import { useQuery, useQueryClient } from '@tanstack/react-query'
import { apiEx, type Agent } from '@/lib/api'
import { Shell } from '@/components/shell/shell'
import { NAV_LABELS } from '@/lib/app-config'
import { Breadcrumb, BreadcrumbItem, BreadcrumbLink } from '@/components/ui/breadcrumb'
import { AgentCard } from '@/components/agents/agent-card'

export default function AgentsPage() {
  const qc = useQueryClient()
  const { data: agents, isLoading, error } = useQuery({ queryKey: ['agents'], queryFn: apiEx.agents.list })
  return (
    <Shell>
      <Breadcrumb className="mb-4">
        <BreadcrumbItem><BreadcrumbLink href="/">{NAV_LABELS.dashboard}</BreadcrumbLink></BreadcrumbItem>
      </Breadcrumb>
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Agents</h1>
      </div>
      {isLoading ? (
        <div>Loading agents...</div>
      ) : error ? (
        <div className="text-red-600">Failed to load agents</div>
      ) : agents?.length ? (
        <div className="grid gap-4 grid-cols-1 md:grid-cols-2 xl:grid-cols-3">
          {agents.map((a) => (
            <AgentCard key={a.id} agent={a} />
          ))}
        </div>
      ) : (
        <div className="text-muted-foreground">No agents registered.</div>
      )}
    </Shell>
  )
}

