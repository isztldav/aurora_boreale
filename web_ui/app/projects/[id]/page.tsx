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
                          <>
                            <Button size="sm" onClick={() => api.runs.start(r.id).then(() => qc.invalidateQueries({ queryKey: ['runs', { projectId }] }))} className="shrink-0">
                              <span className="hidden sm:inline">Start</span>
                              <span className="sm:hidden">▶️</span>
                            </Button>
                            <Button variant="outline" size="sm" onClick={() => api.runs.cancel(r.id).then(() => qc.invalidateQueries({ queryKey: ['runs', { projectId }] }))} className="shrink-0">
                              <span className="hidden sm:inline">Cancel</span>
                              <span className="sm:hidden">❌</span>
                            </Button>
                          </>
                        )}
                        {r.state === 'running' && (
                          <>
                            <Button variant="secondary" size="sm" onClick={() => api.runs.finish(r.id, true).then(() => qc.invalidateQueries({ queryKey: ['runs', { projectId }] }))} className="shrink-0">
                              <span className="hidden sm:inline">Finish</span>
                              <span className="sm:hidden">✅</span>
                            </Button>
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
  const [realtimeLogs, setRealtimeLogs] = useState<string[]>([])

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
    refetchInterval: runId && !realtimeLogs.length ? 3000 : false, // Stop polling when we have realtime logs
  })

  // Set up WebSocket for real-time logs
  useEffect(() => {
    if (!runId) {
      setRealtimeLogs([])
      return
    }

    const ws = makeRunsWS((msg) => {
      if (msg.type === 'run.log' && msg.run_id === runId) {
        const timestamp = new Date(msg.timestamp).toLocaleTimeString('en-US', { hour12: false })
        const levelPrefix = msg.level !== 'info' ? `[${msg.level.toUpperCase()}]` : ''
        const sourcePrefix = msg.source !== 'agent' ? `[${msg.source}]` : ''
        const prefix = `${timestamp} ${levelPrefix}${sourcePrefix}`.trim()
        const logLine = `${prefix} ${msg.message}`

        setRealtimeLogs(prev => [...prev, logLine])
      }
    })

    ws.connect()
    return () => {
      ws.disconnect()
      setRealtimeLogs([])
    }
  }, [runId])
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
            {loadingLogs && !realtimeLogs.length ? (
              <div className="text-sm">Loading logs…</div>
            ) : logsErr && !realtimeLogs.length ? (
              <div className="text-sm text-red-600">Failed to load logs</div>
            ) : (
              <pre className="text-xs bg-muted p-3 rounded overflow-auto max-h-[70vh]">
{(realtimeLogs.length > 0 ? realtimeLogs : (logs?.lines || [])).join('\n')}
              </pre>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

function ModelTestingDialog({ runId, onOpenChange }: { runId: string | null; onOpenChange: (open: boolean) => void }) {
  const [selectedImage, setSelectedImage] = useState<File | null>(null)
  const [imagePreview, setImagePreview] = useState<string | null>(null)
  const [isUploading, setIsUploading] = useState(false)
  const [testResults, setTestResults] = useState<any>(null)
  const [error, setError] = useState<string | null>(null)

  const { data: runInfo, isLoading: loadingInfo, error: infoError } = useQuery({
    queryKey: ['model-testing-info', { runId }],
    queryFn: () => api.modelTesting.getRunInfo(runId!),
    enabled: !!runId,
    retry: false, // Don't retry on error for immediate feedback
  })

  const handleImageSelect = (file: File) => {
    setSelectedImage(file)
    setTestResults(null)
    setError(null)

    // Create preview
    const reader = new FileReader()
    reader.onload = (e) => {
      setImagePreview(e.target?.result as string)
    }
    reader.readAsDataURL(file)
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    const files = Array.from(e.dataTransfer.files)
    const imageFile = files.find(f => f.type.startsWith('image/'))
    if (imageFile) {
      handleImageSelect(imageFile)
    }
  }

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      handleImageSelect(file)
    }
  }

  const handleTest = async () => {
    if (!selectedImage || !runId) return

    setIsUploading(true)
    setError(null)

    try {
      const result = await api.modelTesting.testImage(runId, selectedImage)
      setTestResults(result)
    } catch (err: any) {
      // Provide user-friendly error messages for common issues
      let errorMessage = err.message || 'Failed to test image'

      if (errorMessage.includes('No class labels found')) {
        errorMessage = 'This model cannot be tested because it was not trained with proper class labels. Please retrain the model.'
      } else if (errorMessage.includes('Checkpoint not found')) {
        errorMessage = 'Model checkpoint not found. The training may have failed or been interrupted.'
      } else if (errorMessage.includes('Config not found')) {
        errorMessage = 'Training configuration not found. This model may be from an older version.'
      } else if (errorMessage.includes('Invalid image format')) {
        errorMessage = 'Invalid image format. Please upload a valid JPG, PNG, or WebP image.'
      } else if (errorMessage.includes('Image too large')) {
        errorMessage = 'Image is too large. Please upload an image smaller than 10MB.'
      } else if (errorMessage.includes('Failed to load model architecture')) {
        errorMessage = 'Could not load the model architecture. The model may be incompatible or corrupted.'
      } else if (errorMessage.includes('Failed to load trained weights')) {
        errorMessage = 'Could not load the trained model weights. The checkpoint may be corrupted.'
      } else if (errorMessage.includes('Image preprocessing failed')) {
        errorMessage = 'Failed to process the image. Please try a different image.'
      }

      setError(errorMessage)
    } finally {
      setIsUploading(false)
    }
  }

  const reset = () => {
    setSelectedImage(null)
    setImagePreview(null)
    setTestResults(null)
    setError(null)
  }

  return (
    <Dialog open={!!runId} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[900px] w-[95vw]">
        <div className="flex items-center justify-between mb-4">
          <DialogTitle>Test Model{runInfo ? ` • ${runInfo.run_name}` : ''}</DialogTitle>
          <Button variant="outline" size="sm" onClick={reset}>
            Reset
          </Button>
        </div>

        {loadingInfo ? (
          <div className="text-sm">Loading model info…</div>
        ) : infoError ? (
          <div className="border border-red-200 bg-red-50 rounded-lg p-4">
            <div className="flex items-start space-x-3">
              <div className="text-red-500 mt-0.5">
                <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                </svg>
              </div>
              <div>
                <div className="text-sm font-medium text-red-800 mb-1">
                  Model Not Available
                </div>
                <div className="text-sm text-red-700">
                  {(infoError as any)?.message || 'Failed to load model information. The model may not be available for testing.'}
                </div>
              </div>
            </div>
          </div>
        ) : !runInfo?.can_test ? (
          <div className="border border-yellow-200 bg-yellow-50 rounded-lg p-4">
            <div className="flex items-start space-x-3">
              <div className="text-yellow-500 mt-0.5">
                <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                </svg>
              </div>
              <div>
                <div className="text-sm font-medium text-yellow-800 mb-1">
                  Testing Not Available
                </div>
                <div className="text-sm text-yellow-700">
                  This model cannot be tested. Ensure the run completed successfully and has a checkpoint available.
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Model Info */}
            <div className="bg-muted p-3 rounded text-sm">
              <div className="font-medium">Model Information</div>
              <div className="mt-1 space-y-1">
                <div>Classes: {runInfo.num_classes}</div>
                <div>Epoch: {runInfo.epoch}</div>
                <div>Best {runInfo.monitor_metric}: {runInfo.best_value}</div>
                {runInfo.class_labels.length > 0 && (
                  <div>
                    Labels: {runInfo.class_labels.slice(0, 5).join(', ')}
                    {runInfo.class_labels.length > 5 && ` ... (+${runInfo.class_labels.length - 5} more)`}
                  </div>
                )}
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {/* Image Upload */}
              <div>
                <div className="text-sm font-medium mb-2">Upload Image</div>
                {!selectedImage ? (
                  <div
                    className="border-2 border-dashed border-muted-foreground/25 rounded-lg p-8 text-center cursor-pointer hover:border-muted-foreground/50 transition-colors"
                    onDrop={handleDrop}
                    onDragOver={(e) => e.preventDefault()}
                    onClick={() => document.getElementById('image-upload')?.click()}
                  >
                    <div className="text-muted-foreground mb-2">
                      Drag and drop an image here, or click to select
                    </div>
                    <div className="text-xs text-muted-foreground">
                      Supports JPG, PNG, WebP (max 10MB)
                    </div>
                    <input
                      id="image-upload"
                      type="file"
                      accept="image/*"
                      onChange={handleFileInput}
                      className="hidden"
                    />
                  </div>
                ) : (
                  <div className="space-y-2">
                    <div className="relative">
                      <img
                        src={imagePreview!}
                        alt="Preview"
                        className="w-full h-48 object-contain border rounded"
                      />
                    </div>
                    <div className="flex gap-2">
                      <Button onClick={handleTest} disabled={isUploading} className="flex-1">
                        {isUploading ? 'Testing...' : 'Test Image'}
                      </Button>
                      <Button variant="outline" onClick={reset}>
                        Change Image
                      </Button>
                    </div>
                  </div>
                )}
              </div>

              {/* Results */}
              <div>
                <div className="text-sm font-medium mb-2">Predictions</div>
                {error ? (
                  <div className="border border-red-200 bg-red-50 rounded-lg p-4">
                    <div className="flex items-start space-x-3">
                      <div className="text-red-500 mt-0.5">
                        <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                        </svg>
                      </div>
                      <div>
                        <div className="text-sm font-medium text-red-800 mb-1">
                          Testing Failed
                        </div>
                        <div className="text-sm text-red-700">
                          {error}
                        </div>
                        <div className="mt-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setError(null)}
                            className="text-red-600 border-red-200 hover:bg-red-100"
                          >
                            Try Again
                          </Button>
                        </div>
                      </div>
                    </div>
                  </div>
                ) : !testResults ? (
                  <div className="text-sm text-muted-foreground bg-muted p-3 rounded">
                    Upload an image to see predictions
                  </div>
                ) : (
                  <div className="space-y-2 max-h-48 overflow-y-auto">
                    {testResults.predictions.slice(0, 10).map((pred: any, idx: number) => (
                      <div
                        key={idx}
                        className={`flex items-center justify-between p-2 rounded ${
                          idx === 0 ? 'bg-primary/10 border-primary/20 border' : 'bg-muted'
                        }`}
                      >
                        <div className="font-medium">{pred.class_name}</div>
                        <div className="text-sm">
                          {pred.percentage}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}