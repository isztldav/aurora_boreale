"use client"

import { useParams } from 'next/navigation'
import { useMemo, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { apiEx } from '@/lib/api'
import { Shell } from '@/components/shell/shell'
import { ProjectNav } from '@/components/projects/project-nav'
import { Table, THead, TBody, TR, TH, TD } from '@/components/ui/table'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogTrigger, DialogTitle } from '@/components/ui/dialog'

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
        <div className="p-4 border-b flex items-center justify-between gap-2">
          <h2 className="text-sm font-medium">Models</h2>
          <div className="flex items-center gap-2">
            <Input placeholder="Search models" value={q} onChange={(e) => setQ(e.target.value)} className="w-[240px]" />
            <NewModelDialog projectId={projectId} onCreated={() => qc.invalidateQueries({ queryKey: ['models', { projectId }] })} />
          </div>
        </div>
        {isLoading ? <div className="p-4">Loading...</div> : error ? <div className="p-4 text-red-600">Failed to load models</div> : filtered.length === 0 ? (
          <div className="p-4 text-sm text-muted-foreground">No models found.</div>
        ) : (
          <Table>
            <THead>
              <TR>
                <TH>Label</TH>
                <TH>Checkpoint</TH>
                <TH className="text-right">Actions</TH>
              </TR>
            </THead>
            <TBody>
              {filtered.map((m) => (
                <TR key={m.id}>
                  <TD className="font-medium">{m.label}</TD>
                  <TD className="truncate max-w-[360px]" title={m.hf_checkpoint_id}>{m.hf_checkpoint_id}</TD>
                  <TD className="text-right">
                    <Button variant="outline" size="sm" onClick={() => apiEx.models.delete(m.id).then(() => qc.invalidateQueries({ queryKey: ['models', { projectId }] }))}>Delete</Button>
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </div>
    </Shell>
  )
}

function NewModelDialog({ projectId, onCreated }: { projectId: string; onCreated: () => void }) {
  const [open, setOpen] = useState(false)
  const [label, setLabel] = useState('')
  const [ckpt, setCkpt] = useState('')
  const [notes, setNotes] = useState('')
  const submit = async () => {
    try {
      await apiEx.models.create(projectId, { label, hf_checkpoint_id: ckpt, notes })
      setOpen(false)
      setLabel(''); setCkpt(''); setNotes('')
      onCreated()
    } catch {}
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
            <Input id="label" value={label} onChange={(e) => setLabel(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="ckpt">HF Checkpoint</Label>
            <Input id="ckpt" value={ckpt} onChange={(e) => setCkpt(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="notes">Notes</Label>
            <Textarea id="notes" value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={submit} disabled={!label || !ckpt}>Create</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
