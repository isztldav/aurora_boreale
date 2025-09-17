"use client"

import { useQuery } from '@tanstack/react-query'
import { apiEx } from '@/lib/api'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'

interface RunConfigDialogProps {
  run: { id: string; name: string; config_id: string } | null
  onOpenChange: (open: boolean) => void
}

export function RunConfigDialog({ run, onOpenChange }: RunConfigDialogProps) {
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
            <div className="text-sm text-muted-foreground">Config "{data.name}" • v{data.version} • {data.status}</div>
            <pre className="text-xs bg-muted p-3 rounded overflow-auto max-h-[70vh]">
{JSON.stringify(data.config_json, null, 2)}
            </pre>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  )
}