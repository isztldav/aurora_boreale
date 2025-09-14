"use client"

import { useParams } from 'next/navigation'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useMemo, useState } from 'react'
import { api, apiEx } from '@/lib/api'
import { Shell } from '@/components/shell/shell'
import { ProjectNav } from '@/components/projects/project-nav'
import { Table, THead, TBody, TR, TH, TD } from '@/components/ui/table'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { Dialog, DialogContent, DialogTrigger, DialogTitle } from '@/components/ui/dialog'
import { Checkbox } from '@/components/ui/checkbox'
import { toast } from 'sonner'

export default function ProjectConfigsPage() {
  const params = useParams<{ id: string }>()
  const projectId = params.id
  const qc = useQueryClient()
  const { data, isLoading, error } = useQuery({ queryKey: ['configs', { projectId }], queryFn: () => apiEx.configs.list(projectId) })
  const { data: groups } = useQuery({ queryKey: ['groups', { projectId }], queryFn: () => api.groups.list(projectId) })
  const { data: models } = useQuery({ queryKey: ['models', { projectId }], queryFn: () => apiEx.models.list(projectId) })
  const { data: datasets } = useQuery({ queryKey: ['datasets', { projectId }], queryFn: () => apiEx.datasets.list(projectId) })

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
                      <QueueRunDialog projectId={projectId} configId={c.id} />
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          )}
        </div>
        <div className="rounded-lg border">
          <div className="p-4 border-b"><h2 className="text-sm font-medium">New Config</h2></div>
          <ConfigForm projectId={projectId} groups={groups || []} models={models || []} datasets={datasets || []} onCreated={() => qc.invalidateQueries({ queryKey: ['configs', { projectId }] })} />
        </div>
      </div>
    </Shell>
  )
}

function ConfigForm({ projectId, groups, models, datasets, onCreated }: { projectId: string; groups: { id: string; name: string }[]; models: { label: string; hf_checkpoint_id: string }[]; datasets: { id: string; name: string; root_path: string }[]; onCreated: () => void }) {
  const [name, setName] = useState('baseline')
  const [groupId, setGroupId] = useState<string | undefined>(undefined)
  const [root, setRoot] = useState('')
  const [datasetId, setDatasetId] = useState<string | 'custom' | undefined>(undefined)
  const [modelFlavour, setModelFlavour] = useState('google/vit-base-patch16-224')
  const [loss, setLoss] = useState('cross_entropy')
  const [batchSize, setBatchSize] = useState(64)
  const [epochs, setEpochs] = useState(10)
  const [optimizer, setOptimizer] = useState('adamw')
  const [lr, setLr] = useState(5e-4)
  const [weightDecay, setWeightDecay] = useState(0.05)
  const [warmup, setWarmup] = useState(0.05)
  const [prefetch, setPrefetch] = useState(4)
  const [workers, setWorkers] = useState(4)
  const [persistentWorkers, setPersistentWorkers] = useState(false)
  const [gradAccum, setGradAccum] = useState(1)
  const [seed, setSeed] = useState(42)
  const [loadPretrained, setLoadPretrained] = useState(true)
  const [tbRoot, setTbRoot] = useState('runs')
  const [ckptDir, setCkptDir] = useState('checkpoints')
  const [monitorMetric, setMonitorMetric] = useState('val_acc@1')
  const [monitorMode, setMonitorMode] = useState<'max'|'min'>('max')
  const [modelSuffix, setModelSuffix] = useState('')
  const [maxPerClass, setMaxPerClass] = useState(10000)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      const cfg = {
        root,
        model_flavour: modelFlavour,
        loss_name: loss,
        batch_size: Number(batchSize),
        num_workers: Number(workers),
        prefetch_factor: Number(prefetch),
        persistent_workers: Boolean(persistentWorkers),
        epochs: Number(epochs),
        optimizer,
        lr: Number(lr),
        weight_decay: Number(weightDecay),
        max_grad_norm: 1.0,
        warmup_ratio: Number(warmup),
        grad_accum_steps: Number(gradAccum),
        seed: Number(seed),
        autocast_dtype: 'torch.bfloat16',
        load_pretrained: Boolean(loadPretrained),
        run_name: null,
        tb_root: tbRoot,
        eval_topk: [3, 5],
        model_suffix: modelSuffix,
        freeze_backbone: false,
        ckpt_dir: ckptDir,
        monitor_metric: monitorMetric,
        monitor_mode: monitorMode,
        save_per_epoch_checkpoint: false,
        max_datapoints_per_class: Number(maxPerClass),
      }
      await apiEx.configs.create({ project_id: projectId, name, group_id: groupId, config_json: cfg })
      onCreated()
      toast.success('Config created')
    } catch (e: any) {
      toast.error(e?.message || 'Failed to create config')
    }
  }

  return (
    <form className="p-4 space-y-4" onSubmit={submit}>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <Label htmlFor="name">Name</Label>
          <Input id="name" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div>
          <Label>Group</Label>
          <Select value={groupId ?? 'none'} onValueChange={(v) => setGroupId(v === 'none' ? undefined : v)}>
            <SelectTrigger><SelectValue placeholder="Select group (optional)" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="none">None</SelectItem>
              {groups.map((g) => (<SelectItem key={g.id} value={g.id}>{g.name}</SelectItem>))}
            </SelectContent>
          </Select>
        </div>
        <div className="sm:col-span-2">
          <Label>Dataset</Label>
          <Select
            value={datasetId ?? (datasets[0]?.id ?? 'custom')}
            onValueChange={(v) => {
              if (v === 'custom') {
                setDatasetId('custom')
                setRoot('')
              } else {
                setDatasetId(v)
                const d = datasets.find((x) => x.id === v)
                setRoot(d?.root_path || '')
              }
            }}
          >
            <SelectTrigger><SelectValue placeholder="Select dataset" /></SelectTrigger>
            <SelectContent>
              {datasets.map((d) => (
                <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
              ))}
              <SelectItem value="custom">Custom path…</SelectItem>
            </SelectContent>
          </Select>
          {datasetId === 'custom' && (
            <div className="mt-2">
              <Label htmlFor="root">Dataset Root</Label>
              <Input id="root" value={root} onChange={(e) => setRoot(e.target.value)} placeholder="/app/datasets/your-dataset" />
            </div>
          )}
          {datasetId && datasetId !== 'custom' && root && (
            <div className="mt-1 text-xs text-muted-foreground">Path: {root}</div>
          )}
        </div>
        <div>
          <Label>Model</Label>
          <Select value={modelFlavour} onValueChange={setModelFlavour}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {models.map((m) => (<SelectItem key={m.label} value={m.hf_checkpoint_id}>{m.label}</SelectItem>))}
              <SelectItem value="google/vit-base-patch16-224">google/vit-base-patch16-224</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>Loss</Label>
          <Select value={loss} onValueChange={setLoss}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="cross_entropy">cross_entropy</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>Batch Size</Label>
          <Input type="number" value={batchSize} onChange={(e) => setBatchSize(Number(e.target.value))} />
        </div>
        <div>
          <Label>Epochs</Label>
          <Input type="number" value={epochs} onChange={(e) => setEpochs(Number(e.target.value))} />
        </div>
        <div>
          <Label>Optimizer</Label>
          <Select value={optimizer} onValueChange={setOptimizer}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="adam">adam</SelectItem>
              <SelectItem value="adamw">adamw</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>LR</Label>
          <Input type="number" step="any" value={lr} onChange={(e) => setLr(Number(e.target.value))} />
        </div>
        <div>
          <Label>Weight Decay</Label>
          <Input type="number" step="any" value={weightDecay} onChange={(e) => setWeightDecay(Number(e.target.value))} />
        </div>
        <div>
          <Label>Warmup Ratio</Label>
          <Input type="number" step="any" value={warmup} onChange={(e) => setWarmup(Number(e.target.value))} />
        </div>
        <div>
          <Label>Num Workers</Label>
          <Input type="number" value={workers} onChange={(e) => setWorkers(Number(e.target.value))} />
        </div>
        <div>
          <Label>Prefetch Factor</Label>
          <Input type="number" value={prefetch} onChange={(e) => setPrefetch(Number(e.target.value))} />
        </div>
        <div>
          <Label>Grad Accum Steps</Label>
          <Input type="number" value={gradAccum} onChange={(e) => setGradAccum(Number(e.target.value))} />
        </div>
        <div>
          <Label>Seed</Label>
          <Input type="number" value={seed} onChange={(e) => setSeed(Number(e.target.value))} />
        </div>
        <div className="sm:col-span-2">
          <Label>Load Pretrained</Label>
          <div><Switch checked={loadPretrained} onCheckedChange={setLoadPretrained} /></div>
        </div>
        <div>
          <Label>TB Root</Label>
          <Input value={tbRoot} onChange={(e) => setTbRoot(e.target.value)} />
        </div>
        <div>
          <Label>CKPT Dir</Label>
          <Input value={ckptDir} onChange={(e) => setCkptDir(e.target.value)} />
        </div>
        <div>
          <Label>Monitor Metric</Label>
          <Select value={monitorMetric} onValueChange={setMonitorMetric}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="val_acc@1">val_acc@1</SelectItem>
              <SelectItem value="val_loss">val_loss</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>Monitor Mode</Label>
          <Select value={monitorMode} onValueChange={(v) => setMonitorMode(v as 'max'|'min')}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="max">max</SelectItem>
              <SelectItem value="min">min</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>Model Suffix</Label>
          <Input value={modelSuffix} onChange={(e) => setModelSuffix(e.target.value)} />
        </div>
        <div>
          <Label>Max/cls</Label>
          <Input type="number" value={maxPerClass} onChange={(e) => setMaxPerClass(Number(e.target.value))} />
        </div>
      </div>
      <div className="flex justify-end">
        <Button type="submit">Create</Button>
      </div>
    </form>
  )
}

function QueueRunDialog({ projectId, configId }: { projectId: string; configId: string }) {
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
                  <Checkbox disabled={g.is_allocated} checked={!!gpuSel[g.index]} onCheckedChange={(v) => toggleGpu(g.index, Boolean(v))} />
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
