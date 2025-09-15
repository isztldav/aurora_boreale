"use client"

import { useParams } from 'next/navigation'
import { useMemo, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { apiEx, Model } from '@/lib/api'
import { Shell } from '@/components/shell/shell'
import { ProjectNav } from '@/components/projects/project-nav'
import { Table, THead, TBody, TR, TH, TD } from '@/components/ui/table'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogTrigger, DialogTitle } from '@/components/ui/dialog'
import { ModelAutocomplete } from '@/components/ui/model-autocomplete'

export default function ProjectModelsPage() {
  const params = useParams<{ id: string }>()
  const projectId = params.id
  const qc = useQueryClient()
  const { data = [], isLoading, error } = useQuery({ queryKey: ['models', { projectId }], queryFn: () => apiEx.models.list(projectId) })
  const [q, setQ] = useState('')
  const filtered = useMemo(() => data.filter((m) => !q || m.label.toLowerCase().includes(q.toLowerCase())), [data, q])

  return (
    <Shell>
      <ProjectNav projectId={projectId} current="models" />
      <div className="rounded-lg border">
        <div className="p-4 border-b flex flex-col sm:flex-row sm:items-center gap-4">
          <h2 className="text-sm font-medium">Models</h2>
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 sm:ml-auto">
            <Input
              placeholder="Search models"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              className="w-full sm:w-[240px]"
            />
            <NewModelDialog projectId={projectId} existingModels={data} onCreated={() => qc.invalidateQueries({ queryKey: ['models', { projectId }] })} />
          </div>
        </div>
        {isLoading ? <div className="p-4">Loading...</div> : error ? <div className="p-4 text-red-600">Failed to load models</div> : filtered.length === 0 ? (
          <div className="p-4 text-sm text-muted-foreground">No models found.</div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <THead>
                <TR>
                  <TH className="min-w-[120px]">Label</TH>
                  <TH className="min-w-[200px] hidden sm:table-cell">Checkpoint</TH>
                  <TH className="min-w-[120px] hidden lg:table-cell">Notes</TH>
                  <TH className="min-w-[100px] text-right">Actions</TH>
                </TR>
              </THead>
              <TBody>
                {filtered.map((m) => (
                  <TR key={m.id}>
                    <TD className="font-medium">
                      <div className="truncate max-w-[120px] sm:max-w-none">{m.label}</div>
                      {/* Show checkpoint on mobile below label */}
                      <div className="sm:hidden text-xs text-muted-foreground truncate max-w-[120px]" title={m.hf_checkpoint_id}>
                        {m.hf_checkpoint_id}
                      </div>
                    </TD>
                    <TD className="hidden sm:table-cell">
                      <div className="truncate max-w-[200px] lg:max-w-[300px]" title={m.hf_checkpoint_id}>
                        {m.hf_checkpoint_id}
                      </div>
                    </TD>
                    <TD className="hidden lg:table-cell">
                      <div className="truncate max-w-[120px] xl:max-w-[200px]" title={m.notes || ''}>
                        {m.notes || '-'}
                      </div>
                    </TD>
                    <TD className="text-right">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => apiEx.models.delete(m.id).then(() => qc.invalidateQueries({ queryKey: ['models', { projectId }] }))}
                      >
                        <span className="hidden sm:inline">Delete</span>
                        <span className="sm:hidden">Del</span>
                      </Button>
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </div>
        )}
      </div>
    </Shell>
  )
}

function NewModelDialog({ projectId, existingModels, onCreated }: { projectId: string; existingModels: Model[]; onCreated: () => void }) {
  const [open, setOpen] = useState(false)
  const [label, setLabel] = useState('')
  const [ckpt, setCkpt] = useState('')
  const [notes, setNotes] = useState('')
  const [error, setError] = useState('')

  const isDuplicate = Boolean(ckpt && existingModels.some(m => m.hf_checkpoint_id === ckpt))

  const submit = async () => {
    if (isDuplicate) {
      setError('This checkpoint is already registered in the project')
      return
    }
    try {
      await apiEx.models.create(projectId, { label, hf_checkpoint_id: ckpt, notes })
      setOpen(false)
      setLabel(''); setCkpt(''); setNotes(''); setError('')
      onCreated()
    } catch (err) {
      setError('Failed to create model. Please try again.')
    }
  }
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>New Model</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogTitle>New Model</DialogTitle>
        <div className="space-y-3">
          <div>
            <Label htmlFor="label">Label</Label>
            <Input
              id="label"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="e.g., ResNet-50 v2, My custom model"
            />
            <p className="text-xs text-muted-foreground mt-1">
              A friendly name for this model in your project
            </p>
          </div>
          <div>
            <Label htmlFor="ckpt">HuggingFace Model</Label>
            <ModelAutocomplete
              value={ckpt}
              onValueChange={(value) => { setCkpt(value); setError('') }}
              placeholder="Search for a HuggingFace model..."
            />
            {isDuplicate && (
              <p className="text-xs text-red-600 mt-1">
                This checkpoint is already registered in the project
              </p>
            )}
            {!isDuplicate && (
              <p className="text-xs text-muted-foreground mt-1">
                The HuggingFace model ID (e.g., microsoft/resnet-50)
              </p>
            )}
          </div>
          <div>
            <Label htmlFor="notes">Notes</Label>
            <Textarea
              id="notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Optional description, training details, or other notes..."
            />
            <p className="text-xs text-muted-foreground mt-1">
              Optional notes about this model configuration
            </p>
          </div>
          {error && !isDuplicate && (
            <div className="text-xs text-red-600">
              {error}
            </div>
          )}
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={submit} disabled={!label || !ckpt || isDuplicate}>Create</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
