"use client"

import { useQuery } from '@tanstack/react-query'
import { apiEx } from '@/lib/api'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

type ConfigInspectDialogProps = {
  configId: string | null
  onOpenChange: (open: boolean) => void
}

export function ConfigInspectDialog({ configId, onOpenChange }: ConfigInspectDialogProps) {
  const { data: config } = useQuery({
    queryKey: ['config', { id: configId }],
    queryFn: () => apiEx.configs.get(configId!),
    enabled: !!configId,
  })

  if (!config) return null

  const cfg = config.config_json

  return (
    <Dialog open={!!configId} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
        <DialogTitle>Configuration: {config.name}</DialogTitle>
        <div className="space-y-6">
          {/* Basic Information */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <h4 className="font-medium text-sm text-muted-foreground">Name</h4>
              <p className="text-sm">{config.name}</p>
            </div>
            <div>
              <h4 className="font-medium text-sm text-muted-foreground">Version</h4>
              <p className="text-sm">{config.version}</p>
            </div>
            <div>
              <h4 className="font-medium text-sm text-muted-foreground">Status</h4>
              <Badge variant="outline">{config.status}</Badge>
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
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <h4 className="font-medium text-sm text-muted-foreground">Root Path</h4>
                      <p className="text-sm font-mono bg-muted p-2 rounded">{cfg.root}</p>
                    </div>
                    <div>
                      <h4 className="font-medium text-sm text-muted-foreground">Max Samples per Class</h4>
                      <p className="text-sm">{cfg.max_datapoints_per_class || 10000}</p>
                    </div>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                      <h4 className="font-medium text-sm text-muted-foreground">Num Workers</h4>
                      <p className="text-sm">{cfg.num_workers || 4}</p>
                    </div>
                    <div>
                      <h4 className="font-medium text-sm text-muted-foreground">Prefetch Factor</h4>
                      <p className="text-sm">{cfg.prefetch_factor || 4}</p>
                    </div>
                    <div>
                      <h4 className="font-medium text-sm text-muted-foreground">Persistent Workers</h4>
                      <p className="text-sm">{cfg.persistent_workers ? 'Yes' : 'No'}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="model" className="space-y-4 mt-6">
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Model Configuration</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <h4 className="font-medium text-sm text-muted-foreground">Model Architecture</h4>
                      <p className="text-sm font-mono bg-muted p-2 rounded">{cfg.model_flavour}</p>
                    </div>
                    <div>
                      <h4 className="font-medium text-sm text-muted-foreground">Loss Function</h4>
                      <p className="text-sm">{cfg.loss_name || 'cross_entropy'}</p>
                    </div>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                      <h4 className="font-medium text-sm text-muted-foreground">Load Pretrained</h4>
                      <p className="text-sm">{cfg.load_pretrained !== false ? 'Yes' : 'No'}</p>
                    </div>
                    <div>
                      <h4 className="font-medium text-sm text-muted-foreground">Freeze Backbone</h4>
                      <p className="text-sm">{cfg.freeze_backbone ? 'Yes' : 'No'}</p>
                    </div>
                    <div>
                      <h4 className="font-medium text-sm text-muted-foreground">Model Suffix</h4>
                      <p className="text-sm">{cfg.model_suffix || 'None'}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="training" className="space-y-4 mt-6">
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Training Configuration</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                      <h4 className="font-medium text-sm text-muted-foreground">Batch Size</h4>
                      <p className="text-sm">{cfg.batch_size || 64}</p>
                    </div>
                    <div>
                      <h4 className="font-medium text-sm text-muted-foreground">Epochs</h4>
                      <p className="text-sm">{cfg.epochs || 10}</p>
                    </div>
                    <div>
                      <h4 className="font-medium text-sm text-muted-foreground">Random Seed</h4>
                      <p className="text-sm">{cfg.seed || 42}</p>
                    </div>
                  </div>
                  <div>
                    <h4 className="font-medium text-sm text-muted-foreground">Autocast Dtype</h4>
                    <p className="text-sm font-mono">{cfg.autocast_dtype || 'torch.bfloat16'}</p>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="optimization" className="space-y-4 mt-6">
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Optimization Configuration</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <h4 className="font-medium text-sm text-muted-foreground">Optimizer</h4>
                      <p className="text-sm">{cfg.optimizer || 'adamw'}</p>
                    </div>
                    <div>
                      <h4 className="font-medium text-sm text-muted-foreground">Learning Rate</h4>
                      <p className="text-sm">{cfg.lr || 5e-4}</p>
                    </div>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                    <div>
                      <h4 className="font-medium text-sm text-muted-foreground">Weight Decay</h4>
                      <p className="text-sm">{cfg.weight_decay || 0.05}</p>
                    </div>
                    <div>
                      <h4 className="font-medium text-sm text-muted-foreground">Warmup Ratio</h4>
                      <p className="text-sm">{cfg.warmup_ratio || 0.05}</p>
                    </div>
                    <div>
                      <h4 className="font-medium text-sm text-muted-foreground">Grad Accum Steps</h4>
                      <p className="text-sm">{cfg.grad_accum_steps || 1}</p>
                    </div>
                    <div>
                      <h4 className="font-medium text-sm text-muted-foreground">Max Grad Norm</h4>
                      <p className="text-sm">{cfg.max_grad_norm || 1.0}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="augmentation" className="space-y-4 mt-6">
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Data Augmentation</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <h4 className="font-medium text-sm text-muted-foreground mb-2">GPU Batch Augmentation</h4>
                    {cfg.gpu_batch_aug ? (
                      <pre className="text-xs bg-muted p-3 rounded overflow-x-auto">
                        {JSON.stringify(cfg.gpu_batch_aug, null, 2)}
                      </pre>
                    ) : (
                      <p className="text-sm text-muted-foreground">None</p>
                    )}
                  </div>
                  <div>
                    <h4 className="font-medium text-sm text-muted-foreground mb-2">CPU Color Jitter</h4>
                    {cfg.cpu_color_jitter ? (
                      <pre className="text-xs bg-muted p-3 rounded overflow-x-auto">
                        {JSON.stringify(cfg.cpu_color_jitter, null, 2)}
                      </pre>
                    ) : (
                      <p className="text-sm text-muted-foreground">None</p>
                    )}
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="monitoring" className="space-y-4 mt-6">
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Monitoring & Checkpoints</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <h4 className="font-medium text-sm text-muted-foreground">Monitor Metric</h4>
                      <p className="text-sm">{cfg.monitor_metric || 'val_acc@1'}</p>
                    </div>
                    <div>
                      <h4 className="font-medium text-sm text-muted-foreground">Monitor Mode</h4>
                      <p className="text-sm">{cfg.monitor_mode || 'max'}</p>
                    </div>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <h4 className="font-medium text-sm text-muted-foreground">TensorBoard Root</h4>
                      <p className="text-sm font-mono bg-muted p-2 rounded">{cfg.tb_root || 'runs'}</p>
                    </div>
                    <div>
                      <h4 className="font-medium text-sm text-muted-foreground">Checkpoint Directory</h4>
                      <p className="text-sm font-mono bg-muted p-2 rounded">{cfg.ckpt_dir || 'checkpoints'}</p>
                    </div>
                  </div>
                  <div>
                    <h4 className="font-medium text-sm text-muted-foreground">Save Per Epoch Checkpoint</h4>
                    <p className="text-sm">{cfg.save_per_epoch_checkpoint ? 'Yes' : 'No'}</p>
                  </div>
                  {cfg.eval_topk && (
                    <div>
                      <h4 className="font-medium text-sm text-muted-foreground">Evaluation Top-K</h4>
                      <p className="text-sm">{cfg.eval_topk.join(', ')}</p>
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>

          <div className="flex justify-end">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Close
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}