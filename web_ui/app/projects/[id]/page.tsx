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
import { toast } from 'sonner'
import { Alert } from '@/components/ui/alert'
import { RunStateBadge } from '@/components/projects/run-state-badge'
import { RunConfigDialog } from '@/components/projects/run-config-dialog'
import { RunLiveDialog } from '@/components/projects/run-live-dialog'
import { ModelTestingDialog } from '@/components/projects/model-testing-dialog'

export default function ProjectPage() {
  const params = useParams<{ id: string }>()
  const projectId = params.id
  const qc = useQueryClient()

  const { data: runs, isLoading, error } = useQuery({
    queryKey: ['runs', { projectId }],
    queryFn: () => api.runs.list({ project_id: projectId }),
  })
  const { data: configs } = useQuery({
    queryKey: ['configs', { projectId }],
    queryFn: () => apiEx.configs.list(projectId),
  })
  const [q, setQ] = useState('')
  const [states, setStates] = useState<Record<string, boolean>>({ running: true, queued: true, failed: true, succeeded: true, canceled: true })
  const [cols, setCols] = useState<Record<string, boolean>>({ best: true, epoch: true, started: true, finished: true })
  const [tbRunId, setTbRunId] = useState<string | null>(null)
  const [cfgRun, setCfgRun] = useState<{ id: string; name: string; config_id: string } | null>(null)
  const [openRunId, setOpenRunId] = useState<string | null>(null)
  const [testRunId, setTestRunId] = useState<string | null>(null)
  const filtered = useMemo(() => {
    const sel = new Set(Object.entries(states).filter(([, v]) => v).map(([k]) => k))
    return (runs || []).filter((r) => (
      (!q || r.name.toLowerCase().includes(q.toLowerCase())) &&
      (sel.size === 0 || sel.has(r.state))
    ))
  }, [runs, q, states])

  useEffect(() => {
    const ws = makeRunsWS((msg) => {
      console.log('WebSocket message received:', msg) // Debug logging
      if (msg.type === 'run.updated' || msg.type === 'run.created') {
        const run: Run | undefined = msg.run
        console.log('Run data from WebSocket:', run) // Debug logging
        if (run && run.project_id === projectId) {
          // Update the cache directly for more responsive UI
          qc.setQueryData(['runs', { projectId }], (oldData: Run[] | undefined) => {
            if (!oldData) return oldData

            if (msg.type === 'run.created') {
              return [run, ...oldData]
            } else {
              return oldData.map(r => r.id === run.id ? run : r)
            }
          })

          // Also invalidate to ensure consistency
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
            {byState.length === 0 ? (
              <div className="flex items-center justify-center h-full">
                <Alert className="max-w-md">
                  <div className="flex items-center space-x-2">
                    <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                    </svg>
                    <span>No training runs yet. Create a config and start your first run!</span>
                  </div>
                </Alert>
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={byState}>
                  <XAxis dataKey="state" />
                  <YAxis allowDecimals={false} />
                  <Tooltip />
                  <Bar dataKey="count" fill="#6366f1" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
      </section>

      <section className="rounded-lg border mb-8">
        <div className="p-4 border-b flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <h2 className="text-sm font-medium">Training Configurations</h2>
          <div className="flex items-center gap-2">
            <Badge variant="default">{configs?.length || 0} configs</Badge>
            <Button
              size="sm"
              onClick={() => window.location.href = `/projects/${projectId}/configs`}
            >
              Manage Configs
            </Button>
          </div>
        </div>
        <div className="p-4 text-sm text-muted-foreground">
          {configs && configs.length > 0 ? (
            <>
              You have {configs.length} training configuration{configs.length !== 1 ? 's' : ''} available.
            </>
          ) : (
            <>No training configurations found. </>
          )}
          <a href={`/projects/${projectId}/configs`} className="text-primary hover:underline">
            {configs && configs.length > 0 ? 'View and manage configurations' : 'Create your first config'}
          </a>.
        </div>
      </section>

      <section className="rounded-lg border">
        <div className="p-4 border-b space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <h2 className="text-sm font-medium">Runs</h2>
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
              <Input
                placeholder="Search runs"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                className="w-full sm:w-[220px]"
              />
              <div className="flex items-center gap-2">
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
                  <DropdownMenuTrigger asChild><Button variant="outline" size="sm" className="hidden md:inline-flex">Columns</Button></DropdownMenuTrigger>
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
          </div>
          <Tabs defaultValue="all" className="w-full">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="all" onClick={() => setStates({ running: true, queued: true, failed: true, succeeded: true, canceled: true })}>All</TabsTrigger>
              <TabsTrigger value="active" onClick={() => setStates({ running: true, queued: true, failed: false, succeeded: false, canceled: false })}>Active</TabsTrigger>
              <TabsTrigger value="done" onClick={() => setStates({ running: false, queued: false, failed: true, succeeded: true, canceled: true })}>Done</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
        {isLoading ? (
          <div className="p-4">Loading runs...</div>
        ) : error ? (
          <div className="p-4 text-red-600">Failed to load runs</div>
        ) : filtered.length === 0 ? (
          <div className="p-4 text-sm text-muted-foreground">No runs matching filters.</div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <THead>
                <TR>
                  <TH className="min-w-[150px]">Name</TH>
                  <TH className="min-w-[80px]">State</TH>
                  {cols.best && <TH className="min-w-[60px] hidden sm:table-cell">Best</TH>}
                  {cols.epoch && <TH className="min-w-[70px] hidden sm:table-cell">Epoch</TH>}
                  {cols.started && <TH className="min-w-[120px] hidden md:table-cell">Started</TH>}
                  {cols.finished && <TH className="min-w-[120px] hidden md:table-cell">Finished</TH>}
                  <TH className="min-w-[200px] text-right">Actions</TH>
                </TR>
              </THead>
              <TBody>
                {filtered.map((r) => (
                  <TR key={r.id}>
                    <TD className="font-medium">
                      <button
                        className="text-left text-primary hover:underline truncate max-w-[150px] block"
                        onClick={() => setCfgRun({ id: r.id, name: r.name, config_id: r.config_id })}
                        title={r.name}
                      >
                        {r.name}
                      </button>
                      {/* Show mobile-only metadata below name */}
                      <div className="sm:hidden text-xs text-muted-foreground mt-1 space-y-1">
                        {cols.best && r.best_value && <div>Best: {r.best_value}</div>}
                        {cols.epoch && r.epoch && <div>Epoch: {r.epoch}</div>}
                      </div>
                    </TD>
                    <TD><RunStateBadge state={r.state} /></TD>
                    {cols.best && <TD className="hidden sm:table-cell">{r.best_value ?? '-'}</TD>}
                    {cols.epoch && <TD className="hidden sm:table-cell">{r.epoch ?? '-'}</TD>}
                    {cols.started && <TD className="hidden md:table-cell">{formatDateTime(r.started_at)}</TD>}
                    {cols.finished && <TD className="hidden md:table-cell">{formatDateTime(r.finished_at)}</TD>}
                    <TD className="text-right">
                      <div className="flex items-center gap-1 justify-end flex-wrap">
                        <Button size="sm" onClick={() => setOpenRunId(r.id)} className="shrink-0">
                          <span className="hidden sm:inline">Open</span>
                          <span className="sm:hidden">📊</span>
                        </Button>
                        <Button variant="outline" size="sm" onClick={() => setTbRunId(r.id)} className="shrink-0">
                          <span className="hidden sm:inline">TensorBoard</span>
                          <span className="sm:hidden">📈</span>
                        </Button>
                        {r.state === 'succeeded' && (
                          <Button variant="outline" size="sm" onClick={() => setTestRunId(r.id)} className="shrink-0">
                            <span className="hidden sm:inline">Test Model</span>
                            <span className="sm:hidden">🧪</span>
                          </Button>
                        )}
                        {r.state === 'queued' && (
                          <Button variant="outline" size="sm" onClick={() => api.runs.cancel(r.id).then(() => qc.invalidateQueries({ queryKey: ['runs', { projectId }] }))} className="shrink-0">
                            <span className="hidden sm:inline">Cancel</span>
                            <span className="sm:hidden">❌</span>
                          </Button>
                        )}
                        {r.state === 'running' && (
                          <>
                            <Button variant="outline" size="sm" onClick={() => api.runs.halt(r.id).then(() => qc.invalidateQueries({ queryKey: ['runs', { projectId }] }))} className="shrink-0">
                              <span className="hidden sm:inline">Halt</span>
                              <span className="sm:hidden">⏸️</span>
                            </Button>
                            <Button variant="destructive" size="sm" onClick={() => api.runs.cancel(r.id).then(() => qc.invalidateQueries({ queryKey: ['runs', { projectId }] }))} className="shrink-0">
                              <span className="hidden sm:inline">Cancel</span>
                              <span className="sm:hidden">❌</span>
                            </Button>
                          </>
                        )}
                      </div>
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </div>
        )}
      </section>
      {/* Run Config Viewer */}
      <RunConfigDialog run={cfgRun} onOpenChange={(v) => !v && setCfgRun(null)} />
      {/* Live Run Viewer */}
      <RunLiveDialog runId={openRunId} onOpenChange={(v) => !v && setOpenRunId(null)} />
      {/* Model Testing Dialog */}
      <ModelTestingDialog runId={testRunId} onOpenChange={(v) => !v && setTestRunId(null)} />
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

