"use client"

import { useState, useEffect } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { makeRunsWS } from '@/lib/ws'

interface RunLiveDialogProps {
  runId: string | null
  onOpenChange: (open: boolean) => void
}

export function RunLiveDialog({ runId, onOpenChange }: RunLiveDialogProps) {
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