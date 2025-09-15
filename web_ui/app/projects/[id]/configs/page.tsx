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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
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
      <div className="space-y-6">
        {/* Existing Configs */}
        <div className="rounded-lg border">
          <div className="p-4 border-b flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <h2 className="text-sm font-medium">Training Configurations</h2>
            <Badge variant="secondary">{data?.length || 0} configs</Badge>
          </div>
          {isLoading ? <div className="p-4">Loading...</div> : error ? <div className="p-4 text-red-600">Failed to load configs</div> : (
            <div className="overflow-x-auto">
              <Table>
                <THead>
                  <TR>
                    <TH className="min-w-[120px]">Name</TH>
                    <TH className="min-w-[80px]">Version</TH>
                    <TH className="min-w-[80px]">Status</TH>
                    <TH className="min-w-[120px] text-right">Actions</TH>
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
            </div>
          )}
        </div>

        {/* New Config Form */}
        <ConfigForm projectId={projectId} groups={groups || []} models={models || []} datasets={datasets || []} onCreated={() => qc.invalidateQueries({ queryKey: ['configs', { projectId }] })} />
      </div>
    </Shell>
  )
}

function ConfigForm({ projectId, groups, models, datasets, onCreated }: { projectId: string; groups: { id: string; name: string }[]; models: { label: string; hf_checkpoint_id: string }[]; datasets: { id: string; name: string; root_path: string }[]; onCreated: () => void }) {
  // Basic Configuration
  const [name, setName] = useState('baseline')
  const [groupId, setGroupId] = useState<string | undefined>(undefined)

  // Dataset Configuration
  const [root, setRoot] = useState('')
  const [datasetId, setDatasetId] = useState<string | 'custom' | undefined>(undefined)
  const [maxPerClass, setMaxPerClass] = useState(10000)

  // Model Configuration
  const [modelFlavour, setModelFlavour] = useState('google/vit-base-patch16-224')
  const [loss, setLoss] = useState('cross_entropy')
  const [loadPretrained, setLoadPretrained] = useState(true)
  const [freezeBackbone, setFreezeBackbone] = useState(false)

  // Training Configuration
  const [batchSize, setBatchSize] = useState(64)
  const [epochs, setEpochs] = useState(10)
  const [seed, setSeed] = useState(42)

  // Optimization Configuration
  const [optimizer, setOptimizer] = useState('adamw')
  const [lr, setLr] = useState(5e-4)
  const [weightDecay, setWeightDecay] = useState(0.05)
  const [warmup, setWarmup] = useState(0.05)
  const [gradAccum, setGradAccum] = useState(1)
  const [maxGradNorm, setMaxGradNorm] = useState(1.0)

  // Data Loading Configuration
  const [workers, setWorkers] = useState(4)
  const [prefetch, setPrefetch] = useState(4)
  const [persistentWorkers, setPersistentWorkers] = useState(false)

  // Augmentation Configuration
  const [gpuBatchAug, setGpuBatchAug] = useState('')
  const [cpuColorJitter, setCpuColorJitter] = useState('')
  const [gpuPresetMode, setGpuPresetMode] = useState(true) // true for presets, false for custom
  const [cpuPresetMode, setCpuPresetMode] = useState(true)
  const [selectedGpuPreset, setSelectedGpuPreset] = useState('cfp_dr_v1')
  const [selectedCpuPreset, setSelectedCpuPreset] = useState('cfp_color_v1')

  // Registry data
  const { data: registryData } = useQuery({
    queryKey: ['registry'],
    queryFn: () => fetch('/api/v1/registry/export').then(res => res.json()),
    staleTime: 5 * 60 * 1000, // 5 minutes
  })

  // Monitoring & Checkpoints
  const [monitorMetric, setMonitorMetric] = useState('val_acc@1')
  const [monitorMode, setMonitorMode] = useState<'max'|'min'>('max')
  const [tbRoot, setTbRoot] = useState('runs')
  const [ckptDir, setCkptDir] = useState('checkpoints')
  const [modelSuffix, setModelSuffix] = useState('')
  const [savePerEpoch, setSavePerEpoch] = useState(false)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      // Parse augmentation configurations
      let gpuBatchAugObj = null
      let cpuColorJitterObj = null

      if (gpuPresetMode && selectedGpuPreset) {
        gpuBatchAugObj = { preset: selectedGpuPreset }
      } else if (!gpuPresetMode && gpuBatchAug.trim()) {
        try {
          gpuBatchAugObj = JSON.parse(gpuBatchAug)
        } catch (err) {
          toast.error('Invalid GPU Batch Augmentation JSON')
          return
        }
      }

      if (cpuPresetMode && selectedCpuPreset) {
        cpuColorJitterObj = { preset: selectedCpuPreset }
      } else if (!cpuPresetMode && cpuColorJitter.trim()) {
        try {
          cpuColorJitterObj = JSON.parse(cpuColorJitter)
        } catch (err) {
          toast.error('Invalid CPU Color Jitter JSON')
          return
        }
      }

      const cfg = {
        // Dataset
        root,
        max_datapoints_per_class: Number(maxPerClass),

        // Model
        model_flavour: modelFlavour,
        loss_name: loss,
        load_pretrained: Boolean(loadPretrained),
        freeze_backbone: Boolean(freezeBackbone),

        // Training
        batch_size: Number(batchSize),
        epochs: Number(epochs),
        seed: Number(seed),
        autocast_dtype: 'torch.bfloat16',

        // Optimization
        optimizer,
        lr: Number(lr),
        weight_decay: Number(weightDecay),
        max_grad_norm: Number(maxGradNorm),
        warmup_ratio: Number(warmup),
        grad_accum_steps: Number(gradAccum),

        // Data Loading
        num_workers: Number(workers),
        prefetch_factor: Number(prefetch),
        persistent_workers: Boolean(persistentWorkers),

        // Augmentations
        gpu_batch_aug: gpuBatchAugObj,
        cpu_color_jitter: cpuColorJitterObj,

        // Monitoring & Checkpoints
        monitor_metric: monitorMetric,
        monitor_mode: monitorMode,
        tb_root: tbRoot,
        ckpt_dir: ckptDir,
        model_suffix: modelSuffix,
        save_per_epoch_checkpoint: Boolean(savePerEpoch),

        // Fixed values
        run_name: null,
        eval_topk: [3, 5],
      }

      await apiEx.configs.create({ project_id: projectId, name, group_id: groupId, config_json: cfg })
      onCreated()
      toast.success('Config created successfully')
    } catch (e: any) {
      toast.error(e?.message || 'Failed to create config')
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>New Training Configuration</CardTitle>
        <CardDescription>
          Create a new training configuration with organized settings for datasets, models, training parameters, and augmentations.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={submit} className="space-y-6">
          {/* Basic Information */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label htmlFor="name">Configuration Name</Label>
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g., baseline, augmented-v1"
                required
              />
            </div>
            <div>
              <Label>Group (Optional)</Label>
              <Select value={groupId ?? 'none'} onValueChange={(v) => setGroupId(v === 'none' ? undefined : v)}>
                <SelectTrigger><SelectValue placeholder="Select group" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None</SelectItem>
                  {groups.map((g) => (<SelectItem key={g.id} value={g.id}>{g.name}</SelectItem>))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <Tabs defaultValue="dataset" className="w-full">
            <TabsList className="grid w-full grid-cols-2 md:grid-cols-6">
              <TabsTrigger value="dataset">Dataset</TabsTrigger>
              <TabsTrigger value="model">Model</TabsTrigger>
              <TabsTrigger value="training">Training</TabsTrigger>
              <TabsTrigger value="optimization">Optimization</TabsTrigger>
              <TabsTrigger value="augmentation">Augmentation</TabsTrigger>
              <TabsTrigger value="monitoring">Monitoring</TabsTrigger>
            </TabsList>

            <TabsContent value="dataset" className="space-y-4 mt-6">
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Dataset Configuration</CardTitle>
                  <CardDescription>Configure the dataset and data loading parameters</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
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
                        <Label htmlFor="root">Dataset Root Path</Label>
                        <Input
                          id="root"
                          value={root}
                          onChange={(e) => setRoot(e.target.value)}
                          placeholder="/app/datasets/your-dataset"
                          required
                        />
                      </div>
                    )}
                    {datasetId && datasetId !== 'custom' && root && (
                      <div className="mt-1 text-xs text-muted-foreground">Path: {root}</div>
                    )}
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                      <Label>Max Samples per Class</Label>
                      <Input
                        type="number"
                        value={maxPerClass}
                        onChange={(e) => setMaxPerClass(Number(e.target.value))}
                        min="1"
                      />
                      <p className="text-xs text-muted-foreground mt-1">Limit data for faster experimentation</p>
                    </div>
                    <div>
                      <Label>Num Workers</Label>
                      <Input
                        type="number"
                        value={workers}
                        onChange={(e) => setWorkers(Number(e.target.value))}
                        min="0"
                      />
                      <p className="text-xs text-muted-foreground mt-1">Data loading processes</p>
                    </div>
                    <div>
                      <Label>Prefetch Factor</Label>
                      <Input
                        type="number"
                        value={prefetch}
                        onChange={(e) => setPrefetch(Number(e.target.value))}
                        min="1"
                      />
                      <p className="text-xs text-muted-foreground mt-1">Batches to prefetch per worker</p>
                    </div>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Switch
                      id="persistent-workers"
                      checked={persistentWorkers}
                      onCheckedChange={setPersistentWorkers}
                    />
                    <Label htmlFor="persistent-workers">Persistent Workers</Label>
                    <p className="text-xs text-muted-foreground">Keep workers alive between epochs</p>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="model" className="space-y-4 mt-6">
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Model Configuration</CardTitle>
                  <CardDescription>Configure the model architecture and initialization</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <Label>Model Architecture</Label>
                      <Select value={modelFlavour} onValueChange={setModelFlavour}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {models.map((m) => (
                            <SelectItem key={m.label} value={m.hf_checkpoint_id}>{m.label}</SelectItem>
                          ))}
                          <SelectItem value="google/vit-base-patch16-224">google/vit-base-patch16-224</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label>Loss Function</Label>
                      <Select value={loss} onValueChange={setLoss}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="cross_entropy">Cross Entropy</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="flex items-center space-x-2">
                      <Switch
                        id="load-pretrained"
                        checked={loadPretrained}
                        onCheckedChange={setLoadPretrained}
                      />
                      <Label htmlFor="load-pretrained">Load Pretrained Weights</Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <Switch
                        id="freeze-backbone"
                        checked={freezeBackbone}
                        onCheckedChange={setFreezeBackbone}
                      />
                      <Label htmlFor="freeze-backbone">Freeze Backbone</Label>
                    </div>
                  </div>
                  <div>
                    <Label>Model Suffix (Optional)</Label>
                    <Input
                      value={modelSuffix}
                      onChange={(e) => setModelSuffix(e.target.value)}
                      placeholder="e.g., -finetune"
                    />
                    <p className="text-xs text-muted-foreground mt-1">Added to saved model names</p>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="training" className="space-y-4 mt-6">
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Training Configuration</CardTitle>
                  <CardDescription>Configure basic training parameters</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                      <Label>Batch Size</Label>
                      <Input
                        type="number"
                        value={batchSize}
                        onChange={(e) => setBatchSize(Number(e.target.value))}
                        min="1"
                        required
                      />
                    </div>
                    <div>
                      <Label>Epochs</Label>
                      <Input
                        type="number"
                        value={epochs}
                        onChange={(e) => setEpochs(Number(e.target.value))}
                        min="1"
                        required
                      />
                    </div>
                    <div>
                      <Label>Random Seed</Label>
                      <Input
                        type="number"
                        value={seed}
                        onChange={(e) => setSeed(Number(e.target.value))}
                      />
                    </div>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="optimization" className="space-y-4 mt-6">
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Optimization Configuration</CardTitle>
                  <CardDescription>Configure optimizer and training dynamics</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <Label>Optimizer</Label>
                      <Select value={optimizer} onValueChange={setOptimizer}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="adam">Adam</SelectItem>
                          <SelectItem value="adamw">AdamW</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label>Learning Rate</Label>
                      <Input
                        type="number"
                        step="any"
                        value={lr}
                        onChange={(e) => setLr(Number(e.target.value))}
                        min="0"
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                    <div>
                      <Label>Weight Decay</Label>
                      <Input
                        type="number"
                        step="any"
                        value={weightDecay}
                        onChange={(e) => setWeightDecay(Number(e.target.value))}
                        min="0"
                      />
                    </div>
                    <div>
                      <Label>Warmup Ratio</Label>
                      <Input
                        type="number"
                        step="any"
                        value={warmup}
                        onChange={(e) => setWarmup(Number(e.target.value))}
                        min="0"
                        max="1"
                      />
                    </div>
                    <div>
                      <Label>Grad Accum Steps</Label>
                      <Input
                        type="number"
                        value={gradAccum}
                        onChange={(e) => setGradAccum(Number(e.target.value))}
                        min="1"
                      />
                    </div>
                    <div>
                      <Label>Max Grad Norm</Label>
                      <Input
                        type="number"
                        step="any"
                        value={maxGradNorm}
                        onChange={(e) => setMaxGradNorm(Number(e.target.value))}
                        min="0"
                      />
                    </div>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="augmentation" className="space-y-4 mt-6">
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Data Augmentation</CardTitle>
                  <CardDescription>Configure GPU batch augmentations and CPU color jitter using presets or custom JSON</CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  {/* GPU Batch Augmentation */}
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <Label className="text-base font-medium">GPU Batch Augmentation (Optional)</Label>
                      <div className="flex items-center space-x-2">
                        <span className="text-sm text-muted-foreground">Presets</span>
                        <Switch
                          checked={gpuPresetMode}
                          onCheckedChange={setGpuPresetMode}
                        />
                      </div>
                    </div>

                    {gpuPresetMode ? (
                      <div>
                        <Select value={selectedGpuPreset} onValueChange={setSelectedGpuPreset}>
                          <SelectTrigger>
                            <SelectValue placeholder="Select GPU augmentation preset" />
                          </SelectTrigger>
                          <SelectContent>
                            {registryData?.success && Object.entries(registryData.data.gpu_presets || {}).map(([key, preset]: [string, any]) => (
                              <SelectItem key={key} value={key}>
                                <div>
                                  <div className="font-medium">{preset.name}</div>
                                  <div className="text-xs text-muted-foreground">{preset.description}</div>
                                </div>
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        {selectedGpuPreset && registryData?.success && (
                          <div className="mt-2 p-2 bg-muted rounded text-xs font-mono">
                            {JSON.stringify({ preset: selectedGpuPreset }, null, 2)}
                          </div>
                        )}
                      </div>
                    ) : (
                      <div>
                        <Textarea
                          value={gpuBatchAug}
                          onChange={(e) => setGpuBatchAug(e.target.value)}
                          placeholder='{"ops": [{"name": "RandomHorizontalFlip", "p": 0.5}, {"name": "RandomAffine", "degrees": 10}]}'
                          className="font-mono text-sm"
                          rows={4}
                        />
                        <p className="text-xs text-muted-foreground mt-1">
                          Custom GPU augmentation JSON. Available transforms: RandomHorizontalFlip, RandomVerticalFlip, RandomRotation, RandomAffine, RandomPerspective
                        </p>
                      </div>
                    )}
                    <p className="text-xs text-muted-foreground">
                      Kornia-based geometric augmentations applied to training batches on GPU (after normalization).
                    </p>
                  </div>

                  {/* CPU Color Jitter */}
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <Label className="text-base font-medium">CPU Color Jitter (Optional)</Label>
                      <div className="flex items-center space-x-2">
                        <span className="text-sm text-muted-foreground">Presets</span>
                        <Switch
                          checked={cpuPresetMode}
                          onCheckedChange={setCpuPresetMode}
                        />
                      </div>
                    </div>

                    {cpuPresetMode ? (
                      <div>
                        <Select value={selectedCpuPreset} onValueChange={setSelectedCpuPreset}>
                          <SelectTrigger>
                            <SelectValue placeholder="Select CPU color jitter preset" />
                          </SelectTrigger>
                          <SelectContent>
                            {registryData?.success && Object.entries(registryData.data.cpu_color_presets || {}).map(([key, preset]: [string, any]) => (
                              <SelectItem key={key} value={key}>
                                <div>
                                  <div className="font-medium">{preset.name}</div>
                                  <div className="text-xs text-muted-foreground">{preset.description}</div>
                                </div>
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        {selectedCpuPreset && registryData?.success && (
                          <div className="mt-2 p-2 bg-muted rounded text-xs font-mono">
                            {JSON.stringify({ preset: selectedCpuPreset }, null, 2)}
                          </div>
                        )}
                      </div>
                    ) : (
                      <div>
                        <Textarea
                          value={cpuColorJitter}
                          onChange={(e) => setCpuColorJitter(e.target.value)}
                          placeholder='{"params": {"brightness": 0.2, "contrast": 0.2, "saturation": 0.1, "hue": 0.05}, "p": 0.8}'
                          className="font-mono text-sm"
                          rows={3}
                        />
                        <p className="text-xs text-muted-foreground mt-1">
                          Custom color jitter JSON. Parameters: brightness, contrast, saturation, hue (all non-negative floats)
                        </p>
                      </div>
                    )}
                    <p className="text-xs text-muted-foreground">
                      CPU-side color augmentation applied before normalization, training only.
                    </p>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="monitoring" className="space-y-4 mt-6">
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Monitoring & Checkpoints</CardTitle>
                  <CardDescription>Configure logging, monitoring, and checkpoint saving</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <Label>Monitor Metric</Label>
                      <Select value={monitorMetric} onValueChange={setMonitorMetric}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="val_acc@1">Validation Accuracy@1</SelectItem>
                          <SelectItem value="val_loss">Validation Loss</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label>Monitor Mode</Label>
                      <Select value={monitorMode} onValueChange={(v) => setMonitorMode(v as 'max'|'min')}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="max">Maximize (for accuracy)</SelectItem>
                          <SelectItem value="min">Minimize (for loss)</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <Label>TensorBoard Root</Label>
                      <Input
                        value={tbRoot}
                        onChange={(e) => setTbRoot(e.target.value)}
                        placeholder="runs"
                      />
                    </div>
                    <div>
                      <Label>Checkpoint Directory</Label>
                      <Input
                        value={ckptDir}
                        onChange={(e) => setCkptDir(e.target.value)}
                        placeholder="checkpoints"
                      />
                    </div>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Switch
                      id="save-per-epoch"
                      checked={savePerEpoch}
                      onCheckedChange={setSavePerEpoch}
                    />
                    <Label htmlFor="save-per-epoch">Save Per Epoch Checkpoint</Label>
                    <p className="text-xs text-muted-foreground">Save model after every epoch (uses more disk space)</p>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>

          <div className="flex flex-col sm:flex-row justify-end gap-2 pt-4 border-t">
            <Button type="button" variant="outline" onClick={() => {
              // Reset form to defaults
              setName('baseline')
              setGroupId(undefined)
              setRoot('')
              setDatasetId(undefined)
            }}>
              Reset to Defaults
            </Button>
            <Button type="submit">
              Create Configuration
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
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
