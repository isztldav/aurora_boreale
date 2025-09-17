"use client"

import { useQuery } from '@tanstack/react-query'
import { apiEx, type Agent, type GPU } from '@/lib/api'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { useMemo } from 'react'

interface AgentCardProps {
  agent: Agent
}

export function AgentCard({ agent }: AgentCardProps) {
  const { data: gpus } = useQuery({
    queryKey: ['gpus', { agentId: agent.id }],
    queryFn: () => apiEx.agents.gpus(agent.id)
  })
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
    <Badge variant={variant as any}>
      {g.index}: {g.name || 'GPU'} ({Math.round((g.total_mem_mb || 0) / 1024)} GB)
    </Badge>
  )
}