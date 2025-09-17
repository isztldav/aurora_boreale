"use client"

import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { apiEx } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogTrigger, DialogTitle } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Checkbox } from '@/components/ui/checkbox'
import { toast } from 'sonner'

interface QueueRunDialogProps {
  projectId: string
  configId: string
}

export function QueueRunDialog({ projectId, configId }: QueueRunDialogProps) {
  const qc = useQueryClient()
  const { data: agents = [] } = useQuery({ queryKey: ['agents'], queryFn: apiEx.agents.list })
  const [open, setOpen] = useState(false)
  const [agentId, setAgentId] = useState<string | undefined>(undefined)
  const { data: gpus = [] } = useQuery({ queryKey: ['gpus', { agentId }], queryFn: () => agentId ? apiEx.agents.gpus(agentId) : Promise.resolve([]), enabled: !!agentId })
  const [gpuSel, setGpuSel] = useState<Record<number, boolean>>({})
  const [docker, setDocker] = useState<string>('')
  const [priority, setPriority] = useState<number>(0)

  const toggleGpu = (idx: number, v: boolean) => setGpuSel((s) => ({ ...s, [idx]: v }))
  const selected = Object.entries(gpuSel).filter(([, v]) => v).map(([k]) => Number(k))

  const submit = async () => {
    try {
      await apiEx.configs.queueRun(configId, { agent_id: agentId, gpu_indices: selected, docker_image: docker || undefined, priority })
      setOpen(false)
      setGpuSel({})
      await qc.invalidateQueries({ queryKey: ['runs', { projectId }] })
      toast.success('Run queued')
    } catch (e: any) {
      toast.error(e?.message || 'Failed to queue run')
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">Queue Run</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogTitle>Queue Run</DialogTitle>
        <div className="space-y-3">
          <div>
            <Label>Agent</Label>
            <Select value={agentId} onValueChange={setAgentId}>
              <SelectTrigger><SelectValue placeholder="Select agent" /></SelectTrigger>
              <SelectContent>
                {agents.map((a) => (<SelectItem key={a.id} value={a.id}>{a.name || a.id}</SelectItem>))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>GPUs</Label>
            <div className="grid grid-cols-2 gap-2">
              {(gpus || []).map((g) => (
                <label key={g.id} className="flex items-center gap-2 rounded border p-2 text-sm">
                  <Checkbox checked={!!gpuSel[g.index]} onCheckedChange={(v) => toggleGpu(g.index, Boolean(v))} />
                  <span>#{g.index} {g.name || 'GPU'} ({Math.round((g.total_mem_mb || 0)/1024)} GB){g.is_allocated ? ' • allocated' : ''}</span>
                </label>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Docker Image (optional)</Label>
              <Input value={docker} onChange={(e) => setDocker(e.target.value)} placeholder="e.g. nvidia/cuda:12.1-runtime" />
            </div>
            <div>
              <Label>Priority</Label>
              <Input type="number" value={priority} onChange={(e) => setPriority(Number(e.target.value))} />
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={submit} disabled={!agentId}>Queue</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}