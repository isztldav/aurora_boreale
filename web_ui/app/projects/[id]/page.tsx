"use client"

import { useParams } from 'next/navigation'
import { useEffect, useMemo, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { api, apiEx, type Run } from '@/lib/api'
import { Shell } from '@/components/shell/shell'
import { Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbSeparator } from '@/components/ui/breadcrumb'
import { ProjectNav } from '@/components/projects/project-nav'
import { Table, THead, TBody, TR, TH, TD } from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Checkbox } from '@/components/ui/checkbox'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
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
  const [q, setQ] = useState('')
  const [states, setStates] = useState<Record<string, boolean>>({ running: true, queued: true, failed: true, succeeded: true, canceled: true })
  const [cols, setCols] = useState<Record<string, boolean>>({ best: true, epoch: true, started: true, finished: true })
  const [tbRunId, setTbRunId] = useState<string | null>(null)
  const [cfgRun, setCfgRun] = useState<{ id: string; name: string; config_id: string } | null>(null)
  const [openRunId, setOpenRunId] = useState<string | null>(null)
  const filtered = useMemo(() => {
    const sel = new Set(Object.entries(states).filter(([, v]) => v).map(([k]) => k))
    return (runs || []).filter((r) => (
      (!q || r.name.toLowerCase().includes(q.toLowerCase())) &&
      (sel.size === 0 || sel.has(r.state))
    ))
  }, [runs, q, states])

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
      <Breadcrumb className="mb-4">
        <BreadcrumbItem><BreadcrumbLink href="/">Dashboard</BreadcrumbLink></BreadcrumbItem>
        <BreadcrumbSeparator />
        <BreadcrumbItem><BreadcrumbLink href={`/projects/${projectId}`}>Project {shortId(projectId)}</BreadcrumbLink></BreadcrumbItem>
      </Breadcrumb>
      <div className="mb-4"><h1 className="text-2xl font-semibold">Project {shortId(projectId)}</h1></div>
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
        <div className="p-4 border-b flex items-center justify-between gap-2">
          <h2 className="text-sm font-medium">Runs</h2>
          <div className="flex items-center gap-2">
            <Tabs defaultValue="all">
              <TabsList>
                <TabsTrigger value="all" onClick={() => setStates({ running: true, queued: true, failed: true, succeeded: true, canceled: true })}>All</TabsTrigger>
                <TabsTrigger value="active" onClick={() => setStates({ running: true, queued: true, failed: false, succeeded: false, canceled: false })}>Active</TabsTrigger>
                <TabsTrigger value="done" onClick={() => setStates({ running: false, queued: false, failed: true, succeeded: true, canceled: true })}>Done</TabsTrigger>
              </TabsList>
            </Tabs>
            <Input placeholder="Search runs" value={q} onChange={(e) => setQ(e.target.value)} className="w-[220px]" />
            <Popover>
              <PopoverTrigger asChild><Button variant="outline" size="sm">Filters</Button></PopoverTrigger>
              <PopoverContent align="end">
                <div className="space-y-2">
                  <div className="text-xs font-medium">State</div>
                  {(['running','queued','succeeded','failed','canceled'] as const).map((s) => (
                    <label key={s} className="flex items-center gap-2 text-sm">
                      <Checkbox checked={!!states[s]} onCheckedChange={(v) => setStates((prev) => ({ ...prev, [s]: Boolean(v) }))} />
                      <span className="capitalize">{s}</span>
                    </label>
                  ))}
                </div>
              </PopoverContent>
            </Popover>
            <DropdownMenu>
              <DropdownMenuTrigger asChild><Button variant="outline" size="sm">Columns</Button></DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {([
                  ['best', 'Best'],
                  ['epoch', 'Epoch'],
                  ['started', 'Started'],
                  ['finished', 'Finished'],
                ] as const).map(([key, label]) => (
                  <DropdownMenuItem key={key} className="gap-2" onSelect={(e) => e.preventDefault()}>
                    <Checkbox checked={!!cols[key]} onCheckedChange={(v) => setCols((c) => ({ ...c, [key]: Boolean(v) }))} />
                    <span>{label}</span>
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
        {isLoading ? (
          <div className="p-4">Loading runs...</div>
        ) : error ? (
          <div className="p-4 text-red-600">Failed to load runs</div>
        ) : filtered.length === 0 ? (
          <div className="p-4 text-sm text-muted-foreground">No runs matching filters.</div>
        ) : (
          <Table>
            <THead>
              <TR>
                <TH>Name</TH>
                <TH>State</TH>
                {cols.best && <TH>Best</TH>}
                {cols.epoch && <TH>Epoch</TH>}
                {cols.started && <TH>Started</TH>}
                {cols.finished && <TH>Finished</TH>}
                <TH className="text-right">Actions</TH>
              </TR>
            </THead>
            <TBody>
              {filtered.map((r) => (
                <TR key={r.id}>
                  <TD className="font-medium">
                    <button
                      className="text-left text-primary hover:underline"
                      onClick={() => setCfgRun({ id: r.id, name: r.name, config_id: r.config_id })}
                    >
                      {r.name}
                    </button>
                  </TD>
                  <TD><RunStateBadge state={r.state} /></TD>
                  {cols.best && <TD>{r.best_value ?? '-'}</TD>}
                  {cols.epoch && <TD>{r.epoch ?? '-'}</TD>}
                  {cols.started && <TD>{formatDateTime(r.started_at)}</TD>}
                  {cols.finished && <TD>{formatDateTime(r.finished_at)}</TD>}
                  <TD className="text-right space-x-2">
                    <Button size="sm" onClick={() => setOpenRunId(r.id)}>Open</Button>
                    <Button variant="outline" size="sm" onClick={() => setTbRunId(r.id)}>TensorBoard</Button>
                    {r.state === 'queued' && (
                      <>
                        <Button size="sm" onClick={() => api.runs.start(r.id).then(() => qc.invalidateQueries({ queryKey: ['runs', { projectId }] }))}>Start</Button>
                        <Button variant="outline" size="sm" onClick={() => api.runs.cancel(r.id).then(() => qc.invalidateQueries({ queryKey: ['runs', { projectId }] }))}>Cancel</Button>
                      </>
                    )}
                    {r.state === 'running' && (
                      <>
                        <Button variant="secondary" size="sm" onClick={() => api.runs.finish(r.id, true).then(() => qc.invalidateQueries({ queryKey: ['runs', { projectId }] }))}>Finish</Button>
                        <Button variant="outline" size="sm" onClick={() => api.runs.halt(r.id).then(() => qc.invalidateQueries({ queryKey: ['runs', { projectId }] }))}>Halt</Button>
                        <Button variant="destructive" size="sm" onClick={() => api.runs.cancel(r.id).then(() => qc.invalidateQueries({ queryKey: ['runs', { projectId }] }))}>Cancel</Button>
                      </>
                    )}
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </section>
      {/* Run Config Viewer */}
      <RunConfigDialog run={cfgRun} onOpenChange={(v) => !v && setCfgRun(null)} />
      {/* Live Run Viewer */}
      <RunLiveDialog runId={openRunId} onOpenChange={(v) => !v && setOpenRunId(null)} />
      <Dialog open={!!tbRunId} onOpenChange={(v) => !v && setTbRunId(null)}>
        <DialogContent className="max-w-[1200px] w-[95vw]">
          <div className="flex items-center justify-between mb-2">
            <DialogTitle>TensorBoard</DialogTitle>
            {tbRunId && (
              <Button variant="outline" size="sm" onClick={() => window.open(`/tensorboard/${tbRunId}`, '_blank')}>Open in new tab</Button>
            )}
          </div>
          {tbRunId ? (
            <iframe src={`/tensorboard/${tbRunId}`} className="w-full h-[75vh] bg-white rounded" />
          ) : null}
        </DialogContent>
      </Dialog>
    </Shell>
  )
}

function RunStateBadge({ state }: { state: string }) {
  const variant = state === 'succeeded' ? 'success' : state === 'failed' ? 'error' : state === 'running' ? 'warning' : 'default'
  return <Badge variant={variant as any}>{state}</Badge>
}

function RunConfigDialog({ run, onOpenChange }: { run: { id: string; name: string; config_id: string } | null; onOpenChange: (open: boolean) => void }) {
  const { data, isLoading, error } = useQuery({
    queryKey: ['config', { id: run?.config_id }],
    queryFn: () => apiEx.configs.get(run!.config_id),
    enabled: !!run?.config_id,
  })
  return (
    <Dialog open={!!run} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[900px] w-[95vw]">
        <div className="flex items-center justify-between mb-2">
          <DialogTitle>Run Config{run ? ` • ${run.name}` : ''}</DialogTitle>
        </div>
        {isLoading ? (
          <div className="text-sm">Loading config…</div>
        ) : error ? (
          <div className="text-sm text-red-600">Failed to load config</div>
        ) : data ? (
          <div className="space-y-3">
            <div className="text-sm text-muted-foreground">Config “{data.name}” • v{data.version} • {data.status}</div>
            <pre className="text-xs bg-muted p-3 rounded overflow-auto max-h-[70vh]">
{JSON.stringify(data.config_json, null, 2)}
            </pre>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  )
}

function RunLiveDialog({ runId, onOpenChange }: { runId: string | null; onOpenChange: (open: boolean) => void }) {
  const { data: status, error: statusErr, isLoading: loadingStatus } = useQuery({
    queryKey: ['run-status', { runId }],
    queryFn: () => api.runs.status(runId!),
    enabled: !!runId,
    refetchInterval: runId ? 2000 : false,
  })
  const { data: logs, error: logsErr, isLoading: loadingLogs } = useQuery({
    queryKey: ['run-logs', { runId }],
    queryFn: () => api.runs.logs(runId!, 300),
    enabled: !!runId,
    refetchInterval: runId ? 3000 : false,
  })
  const qc = useQueryClient()
  const halt = async () => {
    if (!runId) return
    try {
      await api.runs.halt(runId)
      qc.invalidateQueries({ queryKey: ['run-status', { runId }] })
    } catch {}
  }
  const progressPct = (() => {
    const e = status?.epoch ?? 0
    const t = status?.total_epochs ?? 0
    if (!t || t <= 0) return 0
    const curr = Math.min(Math.max(e, 0), t)
    return Math.round((curr / t) * 100)
  })()
  return (
    <Dialog open={!!runId} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[1100px] w-[95vw]">
        <div className="flex items-center justify-between mb-2">
          <DialogTitle>Run Live View</DialogTitle>
          {status?.state === 'running' && (
            <Button variant="destructive" size="sm" onClick={halt}>Halt</Button>
          )}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="lg:col-span-1 space-y-2">
            {loadingStatus ? (
              <div className="text-sm">Loading status…</div>
            ) : statusErr ? (
              <div className="text-sm text-red-600">Failed to load status. Agent may be offline or unassigned.</div>
            ) : status ? (
              <div className="space-y-2 text-sm">
                <div className="font-medium">{status.name || '—'}</div>
                <div>State: <span className="font-medium capitalize">{status.state}</span></div>
                <div>Epoch: {status.epoch ?? '—'} / {status.total_epochs ?? '—'}</div>
                <div>Elapsed: {status.elapsed_seconds != null ? `${Math.round(status.elapsed_seconds)}s` : '—'}</div>
                <div>ETA: {status.eta_seconds != null ? `${Math.round(status.eta_seconds)}s` : '—'}</div>
                <div className="mt-2">
                  <div className="h-2 bg-muted rounded">
                    <div className="h-2 bg-primary rounded" style={{ width: `${progressPct}%` }} />
                  </div>
                  <div className="text-xs mt-1 text-muted-foreground">{progressPct}%</div>
                </div>
              </div>
            ) : null}
          </div>
          <div className="lg:col-span-2">
            <div className="text-xs text-muted-foreground mb-1">Agent Logs</div>
            {loadingLogs ? (
              <div className="text-sm">Loading logs…</div>
            ) : logsErr ? (
              <div className="text-sm text-red-600">Failed to load logs</div>
            ) : (
              <pre className="text-xs bg-muted p-3 rounded overflow-auto max-h-[70vh]">
{(logs?.lines || []).join('\n')}
              </pre>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
