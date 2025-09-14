"use client"

import { useParams } from 'next/navigation'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { apiEx } from '@/lib/api'
import { Shell } from '@/components/shell/shell'
import { ProjectNav } from '@/components/projects/project-nav'
import { Table, THead, TBody, TR, TH, TD } from '@/components/ui/table'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Button } from '@/components/ui/button'

export default function ProjectConfigsPage() {
  const params = useParams<{ id: string }>()
  const projectId = params.id
  const qc = useQueryClient()
  const { data, isLoading, error } = useQuery({ queryKey: ['configs', { projectId }], queryFn: () => apiEx.configs.list(projectId) })

  return (
    <Shell>
      <ProjectNav projectId={projectId} current="configs" />
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 rounded-lg border">
          <div className="p-4 border-b"><h2 className="text-sm font-medium">Configs</h2></div>
          {isLoading ? <div className="p-4">Loading...</div> : error ? <div className="p-4 text-red-600">Failed to load configs</div> : (
            <Table>
              <THead>
                <TR>
                  <TH>Name</TH>
                  <TH>Version</TH>
                  <TH>Status</TH>
                  <TH className="text-right">Actions</TH>
                </TR>
              </THead>
              <TBody>
                {data?.map((c) => (
                  <TR key={c.id}>
                    <TD className="font-medium">{c.name}</TD>
                    <TD>{c.version}</TD>
                    <TD>{c.status}</TD>
                    <TD className="text-right">
                      <Button size="sm" onClick={() => apiEx.configs.queueRun(c.id).then(() => qc.invalidateQueries({ queryKey: ['runs', { projectId }] }))}>Queue Run</Button>
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          )}
        </div>
        <div className="rounded-lg border">
          <div className="p-4 border-b"><h2 className="text-sm font-medium">New Config</h2></div>
          <ConfigForm projectId={projectId} onCreated={() => qc.invalidateQueries({ queryKey: ['configs', { projectId }] })} />
        </div>
      </div>
    </Shell>
  )
}

function ConfigForm({ projectId, onCreated }: { projectId: string; onCreated: () => void }) {
  const qc = useQueryClient()
  const [name, setName] = useState('baseline')
  const [groupId, setGroupId] = useState('')
  const [json, setJson] = useState(() => JSON.stringify({
    root: '/app/datasets/your-dataset',
    model_flavour: 'google/vit-base-patch16-224',
    loss_name: 'cross_entropy',
    batch_size: 64,
    epochs: 10,
    optimizer: 'adamw',
    lr: 5e-4,
    weight_decay: 0.05,
    warmup_ratio: 0.05,
    tb_root: 'runs',
    ckpt_dir: 'checkpoints',
    monitor_metric: 'val_acc@1',
    monitor_mode: 'max'
  }, null, 2))
  const [error, setError] = useState<string | null>(null)
  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    try {
      const payload = JSON.parse(json)
      await apiEx.configs.create({ project_id: projectId, name, group_id: groupId || undefined, config_json: payload })
      onCreated()
    } catch (e: any) {
      setError(e?.message || 'Invalid JSON')
    }
  }
  return (
    <form className="p-4 space-y-3" onSubmit={onSubmit}>
      <div>
        <Label htmlFor="name">Name</Label>
        <Input id="name" value={name} onChange={(e) => setName(e.target.value)} />
      </div>
      <div>
        <Label htmlFor="group">Group ID (optional)</Label>
        <Input id="group" value={groupId} onChange={(e) => setGroupId(e.target.value)} />
      </div>
      <div>
        <Label htmlFor="json">Config JSON</Label>
        <Textarea id="json" rows={14} value={json} onChange={(e) => setJson(e.target.value)} />
      </div>
      {error && <div className="text-sm text-red-600">{error}</div>}
      <Button type="submit">Create</Button>
    </form>
  )
}
