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
import { TagSelector } from '@/components/tags/tag-selector'
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
  // Docker and priority features are coming soon
  // const [docker, setDocker] = useState<string>('')
  // const [priority, setPriority] = useState<number>(0)
  const [selectedTags, setSelectedTags] = useState<string[]>([])

  // Fetch available tags for this project only
  const { data: tags = [] } = useQuery({
    queryKey: ['project-tags', { projectId }],
    queryFn: () => apiEx.tags.getProjectTags(projectId)
  })

  const toggleGpu = (idx: number, v: boolean) => setGpuSel((s) => ({ ...s, [idx]: v }))
  const selected = Object.entries(gpuSel).filter(([, v]) => v).map(([k]) => Number(k))

  const submit = async () => {
    try {
      // Queue the run
      const runResult = await apiEx.configs.queueRun(configId, {
        agent_id: agentId,
        gpu_indices: selected
        // docker_image and priority features coming soon
      })

      // Assign tags to the created run if any were selected
      if (selectedTags.length > 0 && runResult?.id) {
        try {
          await apiEx.tags.assignToRun(runResult.id, selectedTags)
        } catch (tagError) {
          console.warn('Failed to assign tags to run:', tagError)
          // Don't fail the whole operation if tag assignment fails
          toast.warning('Run queued but failed to assign tags')
        }
      }

      setOpen(false)
      setGpuSel({})
      setSelectedTags([])
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
            <div className="opacity-50">
              <Label className="text-muted-foreground">Docker Image (coming soon)</Label>
              <Input
                value=""
                placeholder="e.g. nvidia/cuda:12.1-runtime"
                disabled
                className="bg-muted cursor-not-allowed"
              />
            </div>
            <div className="opacity-50">
              <Label className="text-muted-foreground">Priority (coming soon)</Label>
              <Input
                type="number"
                value=""
                placeholder="0"
                disabled
                className="bg-muted cursor-not-allowed"
              />
            </div>
          </div>
          <div>
            <Label>Tags (optional)</Label>
            <TagSelector
              tags={tags}
              selectedTagIds={selectedTags}
              onSelectionChange={setSelectedTags}
              placeholder="Select tags for this run..."
              maxTags={5}
            />
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