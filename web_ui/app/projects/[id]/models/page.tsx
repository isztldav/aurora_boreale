"use client"

import { useParams } from 'next/navigation'
import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { apiEx } from '@/lib/api'
import { Shell } from '@/components/shell/shell'
import { ProjectNav } from '@/components/projects/project-nav'
import { Table, THead, TBody, TR, TH, TD } from '@/components/ui/table'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Button } from '@/components/ui/button'

export default function ProjectModelsPage() {
  const params = useParams<{ id: string }>()
  const projectId = params.id
  const qc = useQueryClient()
  const { data, isLoading, error } = useQuery({ queryKey: ['models', { projectId }], queryFn: () => apiEx.models.list(projectId) })

  return (
    <Shell>
      <ProjectNav projectId={projectId} current="models" />
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 rounded-lg border">
          <div className="p-4 border-b"><h2 className="text-sm font-medium">Models</h2></div>
          {isLoading ? <div className="p-4">Loading...</div> : error ? <div className="p-4 text-red-600">Failed to load models</div> : (
            <Table>
              <THead>
                <TR>
                  <TH>Label</TH>
                  <TH>Checkpoint</TH>
                  <TH className="text-right">Actions</TH>
                </TR>
              </THead>
              <TBody>
                {data?.map((m) => (
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
        <div className="rounded-lg border">
          <div className="p-4 border-b"><h2 className="text-sm font-medium">New Model</h2></div>
          <ModelForm projectId={projectId} onCreated={() => qc.invalidateQueries({ queryKey: ['models', { projectId }] })} />
        </div>
      </div>
    </Shell>
  )
}

function ModelForm({ projectId, onCreated }: { projectId: string; onCreated: () => void }) {
  const [label, setLabel] = useState('vit-base')
  const [ckpt, setCkpt] = useState('google/vit-base-patch16-224')
  const [notes, setNotes] = useState('')
  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    await apiEx.models.create(projectId, { label, hf_checkpoint_id: ckpt, notes })
    onCreated()
  }
  return (
    <form className="p-4 space-y-3" onSubmit={submit}>
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
      <Button type="submit">Create</Button>
    </form>
  )
}

