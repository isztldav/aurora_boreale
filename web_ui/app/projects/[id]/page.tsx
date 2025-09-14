"use client"

import { useParams } from 'next/navigation'
import { useEffect, useMemo } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { api, type Run } from '@/lib/api'
import { Shell } from '@/components/shell/shell'
import { ProjectNav } from '@/components/projects/project-nav'
import { Table, THead, TBody, TR, TH, TD } from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { formatDateTime, shortId } from '@/lib/utils'
import { makeRunsWS } from '@/lib/ws'
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip } from 'recharts'

export default function ProjectPage() {
  const params = useParams<{ id: string }>()
  const projectId = params.id
  const qc = useQueryClient()

  const { data: runs, isLoading, error } = useQuery({
    queryKey: ['runs', { projectId }],
    queryFn: () => api.runs.list({ project_id: projectId }),
  })

  useEffect(() => {
    const ws = makeRunsWS((msg) => {
      if (msg.type === 'run.updated' || msg.type === 'run.created') {
        const run: Run | undefined = msg.run
        if (run && run.project_id === projectId) {
          qc.invalidateQueries({ queryKey: ['runs', { projectId }] })
        }
      }
    })
    ws.connect()
    return () => ws.disconnect()
  }, [projectId, qc])

  const byState = useMemo(() => {
    const map: Record<string, number> = {}
    for (const r of runs || []) map[r.state] = (map[r.state] || 0) + 1
    return Object.entries(map).map(([state, count]) => ({ state, count }))
  }, [runs])

  return (
    <Shell>
      <div className="mb-4">
        <h1 className="text-2xl font-semibold">Project {shortId(projectId)}</h1>
      </div>
      <ProjectNav projectId={projectId} current="overview" />

      <section className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
        <div className="col-span-1 lg:col-span-3 rounded-lg border p-4">
          <h2 className="text-sm font-medium mb-2">Runs by state</h2>
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={byState}>
                <XAxis dataKey="state" />
                <YAxis allowDecimals={false} />
                <Tooltip />
                <Bar dataKey="count" fill="#6366f1" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </section>

      <section className="rounded-lg border">
        <div className="p-4 border-b"><h2 className="text-sm font-medium">Runs</h2></div>
        {isLoading ? (
          <div className="p-4">Loading runs...</div>
        ) : error ? (
          <div className="p-4 text-red-600">Failed to load runs</div>
        ) : (
          <Table>
            <THead>
              <TR>
                <TH>Name</TH>
                <TH>State</TH>
                <TH>Best</TH>
                <TH>Epoch</TH>
                <TH>Started</TH>
                <TH>Finished</TH>
                <TH className="text-right">Actions</TH>
              </TR>
            </THead>
            <TBody>
              {runs?.map((r) => (
                <TR key={r.id}>
                  <TD className="font-medium">{r.name}</TD>
                  <TD><RunStateBadge state={r.state} /></TD>
                  <TD>{r.best_value ?? '-'}</TD>
                  <TD>{r.epoch ?? '-'}</TD>
                  <TD>{formatDateTime(r.started_at)}</TD>
                  <TD>{formatDateTime(r.finished_at)}</TD>
                  <TD className="text-right space-x-2">
                    {r.state === 'queued' && (<Button size="sm" onClick={() => api.runs.start(r.id).then(() => qc.invalidateQueries({ queryKey: ['runs', { projectId }] }))}>Start</Button>)}
                    {r.state === 'running' && (
                      <>
                        <Button variant="secondary" size="sm" onClick={() => api.runs.finish(r.id, true).then(() => qc.invalidateQueries({ queryKey: ['runs', { projectId }] }))}>Finish</Button>
                        <Button variant="outline" size="sm" onClick={() => api.runs.cancel(r.id).then(() => qc.invalidateQueries({ queryKey: ['runs', { projectId }] }))}>Cancel</Button>
                      </>
                    )}
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </section>
    </Shell>
  )
}

function RunStateBadge({ state }: { state: string }) {
  const variant = state === 'succeeded' ? 'success' : state === 'failed' ? 'error' : state === 'running' ? 'warning' : 'default'
  return <Badge variant={variant as any}>{state}</Badge>
}
