"use client"

import { useQuery, useQueryClient } from '@tanstack/react-query'
import { apiEx, type Agent, type GPU } from '@/lib/api'
import { Shell } from '@/components/shell/shell'
import { Breadcrumb, BreadcrumbItem, BreadcrumbLink } from '@/components/ui/breadcrumb'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { useMemo } from 'react'

export default function AgentsPage() {
  const qc = useQueryClient()
  const { data: agents, isLoading, error } = useQuery({ queryKey: ['agents'], queryFn: apiEx.agents.list })
  return (
    <Shell>
      <Breadcrumb className="mb-4">
        <BreadcrumbItem><BreadcrumbLink href="/">Dashboard</BreadcrumbLink></BreadcrumbItem>
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

function AgentCard({ agent }: { agent: Agent }) {
  const { data: gpus } = useQuery({ queryKey: ['gpus', { agentId: agent.id }], queryFn: () => apiEx.agents.gpus(agent.id) })
  const alloc = useMemo(() => (gpus || []).filter((g) => g.is_allocated).length, [gpus])
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <span>{agent.name}</span>
          <span className="text-xs text-muted-foreground">{agent.host || '—'}</span>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="mb-3 text-sm">GPUs: {gpus?.length ?? 0} • Allocated: {alloc}</div>
        <div className="flex flex-wrap gap-2">
          {(gpus || []).map((g) => (
            <GpuBadge key={g.id} g={g} agentId={agent.id} />
          ))}
        </div>
      </CardContent>
    </Card>
  )
}

function GpuBadge({ g, agentId }: { g: GPU; agentId: string }) {
  const variant = g.is_allocated ? 'warning' : 'success'
  return (
    <Badge variant={variant as any}>{g.index}: {g.name || 'GPU'} ({Math.round((g.total_mem_mb || 0) / 1024)} GB)</Badge>
  )
}
