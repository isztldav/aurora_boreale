"use client"

import { useMemo, useState, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api, apiEx, Model } from '@/lib/api'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { toast } from 'sonner'

interface DynamicConfigFormProps {
  projectId: string
  editConfigId?: string | null
  cloneConfigId?: string | null
  groups: { id: string; name: string }[]
  models: { label: string; hf_checkpoint_id: string }[]
  datasets: { id: string; name: string; root_path: string }[]
  onCreated: () => void
}

interface ConfigSchema {
  success: boolean
  schema: any
  defaults: Record<string, any>
  field_groups: Record<string, { title: string; description: string; fields: string[] }>
  field_metadata: Record<string, any>
}

export function DynamicConfigForm({
  projectId,
  editConfigId,
  cloneConfigId,
  groups,
  models,
  datasets,
  onCreated
}: DynamicConfigFormProps) {
  // Fetch config schema and defaults
  const { data: configSchema, isLoading: schemaLoading } = useQuery<ConfigSchema>({
    queryKey: ['config-schema'],
    queryFn: () => fetch('/api/v1/registry/config-schema').then(res => res.json()),
    staleTime: 5 * 60 * 1000, // 5 minutes
  })

  // Load config for editing
  const { data: editConfig } = useQuery({
    queryKey: ['config', { id: editConfigId }],
    queryFn: () => apiEx.configs.get(editConfigId!),
    enabled: !!editConfigId,
  })

  // Load config for cloning
  const { data: cloneConfig } = useQuery({
    queryKey: ['config', { id: cloneConfigId }],
    queryFn: () => apiEx.configs.get(cloneConfigId!),
    enabled: !!cloneConfigId,
  })

  // Registry data for dropdowns
  const { data: registryData } = useQuery({
    queryKey: ['registry'],
    queryFn: () => fetch('/api/v1/registry/export').then(res => res.json()),
    staleTime: 5 * 60 * 1000,
  })

  // Form state - dynamic based on schema
  const [formValues, setFormValues] = useState<Record<string, any>>({})
  const [name, setName] = useState('baseline')
  const [groupId, setGroupId] = useState<string | undefined>(undefined)

  // Initialize form with defaults when schema loads (only for new configs)
  useEffect(() => {
    if (configSchema?.success && configSchema.defaults && !editConfigId && !cloneConfigId) {
      // Set initial values from schema defaults
      setFormValues(configSchema.defaults)

      // Set dataset from first available if none selected
      if (datasets && datasets.length > 0) {
        const firstDataset = datasets[0]
        setFormValues(prev => ({
          ...prev,
          root: firstDataset.root_path
        }))
      }
    }
  }, [configSchema, datasets, editConfigId, cloneConfigId])

  // Populate form when editing or cloning
  useEffect(() => {
    const sourceConfig = editConfig || cloneConfig
    if (sourceConfig && configSchema?.success) {
      const cfg = sourceConfig.config_json

      setName(cloneConfigId ? `${sourceConfig.name}_copy` : sourceConfig.name)
      setGroupId(sourceConfig.group_id)

      // Start with defaults, then overlay with config values (preserving existing values)
      setFormValues({
        ...configSchema.defaults,
        ...cfg
      })
    }
  }, [editConfig, cloneConfig, configSchema, editConfigId, cloneConfigId])

  const updateFormValue = (key: string, value: any) => {
    setFormValues(prev => ({ ...prev, [key]: value }))
  }

  const renderField = (fieldKey: string, fieldMeta: any) => {
    const value = formValues[fieldKey]
    const { ui_type, label, description, placeholder, min, max, step, options } = fieldMeta

    switch (ui_type) {
      case 'dataset_selector':
        return (
          <div key={fieldKey}>
            <Label>{label}</Label>
            <Select
              value={
                value ? (datasets.find(d => d.root_path === value)?.id || 'custom') : ''
              }
              onValueChange={(selectedId) => {
                if (selectedId === 'custom') {
                  updateFormValue(fieldKey, '')
                } else {
                  const dataset = datasets.find(d => d.id === selectedId)
                  updateFormValue(fieldKey, dataset?.root_path || '')
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
            {(!datasets.find(d => d.root_path === value) && value) && (
              <div className="mt-2">
                <Label htmlFor={fieldKey}>Dataset Root Path</Label>
                <Input
                  id={fieldKey}
                  value={value || ''}
                  onChange={(e) => updateFormValue(fieldKey, e.target.value)}
                  placeholder={placeholder}
                  required
                />
              </div>
            )}
            {datasets.find(d => d.root_path === value) && (
              <div className="mt-1 text-xs text-muted-foreground">Path: {value}</div>
            )}
            {description && <p className="text-xs text-muted-foreground mt-1">{description}</p>}
          </div>
        )

      case 'model_selector':
        return (
          <div key={fieldKey}>
            <Label>{label}</Label>
            <Select value={value || ''} onValueChange={(v) => updateFormValue(fieldKey, v || undefined)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {/* Models from project registry */}
                {(models as Model[])?.map((m) => (
                  <SelectItem key={`project-model-${m.id}`} value={m.hf_checkpoint_id}>
                    <div>
                      <div className="font-medium">{m.label}</div>
                      <div className="text-xs text-muted-foreground">{m.notes}</div>
                    </div>
                  </SelectItem>
                ))}

                {/* Models from global registry */}
                {registryData?.success && Object.entries(registryData.data.models || {}).map(([key, model]: [string, any]) => (
                  <SelectItem key={`global-${key}`} value={key}>
                    <div>
                      <div className="font-medium">{model.name}</div>
                      <div className="text-xs text-muted-foreground">{model.description}</div>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {description && <p className="text-xs text-muted-foreground mt-1">{description}</p>}
          </div>
        )

      case 'select':
        const selectOptions = options || []
        if (fieldKey === 'loss_name' && registryData?.success) {
          // Use registry data for loss functions
          const registryOptions = Object.entries(registryData.data.losses || {}).map(([key, lossData]: [string, any]) => ({
            value: key,
            label: lossData.name,
            description: lossData.description
          }))
          selectOptions.push(...registryOptions)
        }
        if (fieldKey === 'optimizer' && registryData?.success) {
          // Use registry data for optimizers
          const registryOptions = Object.entries(registryData.data.optimizers || {}).map(([key, optimizerData]: [string, any]) => ({
            value: key,
            label: optimizerData.name,
            description: optimizerData.description
          }))
          selectOptions.push(...registryOptions)
        }

        return (
          <div key={fieldKey}>
            <Label>{label}</Label>
            <Select value={value || ''} onValueChange={(v) => updateFormValue(fieldKey, v || undefined)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {selectOptions.map((option: any) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.description ? (
                      <div>
                        <div className="font-medium">{option.label}</div>
                        <div className="text-xs text-muted-foreground">{option.description}</div>
                      </div>
                    ) : (
                      option.label
                    )}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {description && <p className="text-xs text-muted-foreground mt-1">{description}</p>}
          </div>
        )

      case 'number':
        return (
          <div key={fieldKey}>
            <Label>{label}</Label>
            <Input
              type="number"
              value={value !== undefined && value !== null ? value : ''}
              onChange={(e) => {
                const numValue = e.target.value === '' ? undefined : Number(e.target.value)
                updateFormValue(fieldKey, numValue)
              }}
              min={min}
              max={max}
              step={step}
              required={configSchema?.schema?.properties?.[fieldKey]?.required}
            />
            {description && <p className="text-xs text-muted-foreground mt-1">{description}</p>}
          </div>
        )

      case 'text':
        return (
          <div key={fieldKey}>
            <Label>{label}</Label>
            <Input
              value={value !== undefined && value !== null ? value : ''}
              onChange={(e) => updateFormValue(fieldKey, e.target.value || undefined)}
              placeholder={placeholder}
            />
            {description && <p className="text-xs text-muted-foreground mt-1">{description}</p>}
          </div>
        )

      case 'switch':
        return (
          <div key={fieldKey} className="flex items-center space-x-2">
            <Switch
              id={fieldKey}
              checked={Boolean(value)}
              onCheckedChange={(checked) => updateFormValue(fieldKey, checked)}
            />
            <Label htmlFor={fieldKey}>{label}</Label>
            {description && <p className="text-xs text-muted-foreground">{description}</p>}
          </div>
        )

      case 'augmentation_config':
        // Keep original augmentation logic for now - could be further refactored
        const isGpu = fieldKey === 'gpu_batch_aug'
        const presetKey = isGpu ? 'gpu_presets' : 'cpu_color_presets'
        const customValue = typeof value === 'object' && !value?.preset ? JSON.stringify(value, null, 2) : ''
        const presetValue = value?.preset || 'none'
        const isPresetMode = value?.preset || !value

        return (
          <div key={fieldKey} className="space-y-3">
            <div className="flex items-center justify-between">
              <Label className="text-base font-medium">{label}</Label>
              <div className="flex items-center space-x-2">
                <span className="text-sm text-muted-foreground">Presets</span>
                <Switch
                  checked={isPresetMode}
                  onCheckedChange={(checked) => {
                    if (checked) {
                      updateFormValue(fieldKey, { preset: 'none' })
                    } else {
                      updateFormValue(fieldKey, null)
                    }
                  }}
                />
              </div>
            </div>

            {isPresetMode ? (
              <div>
                <Select
                  value={presetValue}
                  onValueChange={(preset) => updateFormValue(fieldKey, preset === 'none' ? null : { preset })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder={`Select ${isGpu ? 'GPU' : 'CPU'} augmentation preset`} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">
                      <div>
                        <div className="font-medium">None</div>
                        <div className="text-xs text-muted-foreground">No {isGpu ? 'GPU' : 'CPU'} augmentation</div>
                      </div>
                    </SelectItem>
                    {registryData?.success && Object.entries(registryData.data[presetKey] || {})
                      .filter(([key]) => key !== 'none')
                      .map(([key, preset]: [string, any]) => (
                      <SelectItem key={key} value={key}>
                        <div>
                          <div className="font-medium">{preset.name}</div>
                          <div className="text-xs text-muted-foreground">{preset.description}</div>
                          {preset.tags && (
                            <div className="text-xs text-blue-600 mt-1">
                              {preset.tags.join(', ')}
                            </div>
                          )}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {presetValue && presetValue !== 'none' && (
                  <div className="mt-2 p-2 bg-muted rounded text-xs font-mono">
                    {JSON.stringify({ preset: presetValue }, null, 2)}
                  </div>
                )}
              </div>
            ) : (
              <div>
                <Textarea
                  value={customValue}
                  onChange={(e) => {
                    try {
                      const parsed = e.target.value ? JSON.parse(e.target.value) : null
                      updateFormValue(fieldKey, parsed)
                    } catch (err) {
                      // Keep the invalid JSON in state for user to fix
                      updateFormValue(fieldKey, e.target.value)
                    }
                  }}
                  placeholder={isGpu
                    ? '{"ops": [{"name": "RandomHorizontalFlip", "p": 0.5}, {"name": "RandomAffine", "degrees": 10}]}'
                    : '{"params": {"brightness": 0.2, "contrast": 0.2, "saturation": 0.1, "hue": 0.05}, "p": 0.8}'
                  }
                  className="font-mono text-sm"
                  rows={4}
                />
                <p className="text-xs text-muted-foreground mt-1">
                  {isGpu
                    ? `Custom GPU augmentation JSON. Available transforms: ${
                        registryData?.success
                          ? Object.keys(registryData.data.gpu_transforms || {}).join(', ')
                          : 'RandomHorizontalFlip, RandomVerticalFlip, RandomRotation, RandomAffine, RandomPerspective'
                      }`
                    : 'Custom color jitter JSON. Parameters: brightness, contrast, saturation, hue (all non-negative floats)'
                  }
                </p>
              </div>
            )}
            {description && <p className="text-xs text-muted-foreground">{description}</p>}
          </div>
        )

      default:
        return null
    }
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      // Validate required fields
      if (!formValues.root) {
        toast.error('Dataset root path is required')
        return
      }
      if (!formValues.model_flavour) {
        toast.error('Model architecture is required')
        return
      }

      // Parse and validate augmentation configurations
      if (typeof formValues.gpu_batch_aug === 'string') {
        try {
          formValues.gpu_batch_aug = JSON.parse(formValues.gpu_batch_aug)
        } catch (err) {
          toast.error('Invalid GPU Batch Augmentation JSON')
          return
        }
      }

      if (typeof formValues.cpu_color_jitter === 'string') {
        try {
          formValues.cpu_color_jitter = JSON.parse(formValues.cpu_color_jitter)
        } catch (err) {
          toast.error('Invalid CPU Color Jitter JSON')
          return
        }
      }

      // Clean up the config - ensure proper types
      const cleanedConfig = { ...formValues }

      // Convert string numbers to actual numbers and handle undefined values
      Object.keys(cleanedConfig).forEach(key => {
        const fieldMeta = configSchema?.field_metadata?.[key]
        if (fieldMeta?.ui_type === 'number') {
          if (typeof cleanedConfig[key] === 'string' && cleanedConfig[key] !== '') {
            cleanedConfig[key] = Number(cleanedConfig[key])
          } else if (cleanedConfig[key] === undefined || cleanedConfig[key] === '') {
            // Remove undefined/empty values - let backend handle defaults
            delete cleanedConfig[key]
          }
        }
        // Remove undefined values for other field types as well
        if (cleanedConfig[key] === undefined) {
          delete cleanedConfig[key]
        }
      })

      if (editConfigId) {
        await apiEx.configs.update(editConfigId, { name, group_id: groupId, config_json: cleanedConfig })
        toast.success('Config updated successfully')
        window.location.href = `/projects/${projectId}/configs`
      } else {
        await apiEx.configs.create({ project_id: projectId, name, group_id: groupId, config_json: cleanedConfig })
        toast.success(cloneConfigId ? 'Config cloned successfully' : 'Config created successfully')
        if (cloneConfigId) {
          window.location.href = `/projects/${projectId}/configs`
        }
      }
      onCreated()
    } catch (e: any) {
      toast.error(e?.message || 'Failed to create config')
    }
  }

  if (schemaLoading || !configSchema?.success) {
    return (
      <Card>
        <CardContent className="p-6">
          <div className="text-center">Loading configuration schema...</div>
        </CardContent>
      </Card>
    )
  }

  const { field_groups, field_metadata } = configSchema

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          {editConfigId ? 'Edit Training Configuration' :
           cloneConfigId ? 'Clone Training Configuration' :
           'New Training Configuration'}
        </CardTitle>
        <CardDescription>
          {editConfigId ? 'Edit the training configuration settings.' :
           cloneConfigId ? 'Clone and modify the training configuration. Version will be automatically incremented.' :
           'Create a new training configuration with organized settings for datasets, models, training parameters, and augmentations.'}
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
              {Object.entries(field_groups)
                .filter(([key]) => key !== 'basic' && key !== 'internal') // Skip basic (handled above) and internal fields
                .map(([key, group]) => (
                  <TabsTrigger key={key} value={key}>{group.title.replace(' Configuration', '')}</TabsTrigger>
                ))}
            </TabsList>

            {Object.entries(field_groups)
              .filter(([key]) => key !== 'basic' && key !== 'internal')
              .map(([groupKey, group]) => (
                <TabsContent key={groupKey} value={groupKey} className="space-y-4 mt-6">
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-lg">{group.title}</CardTitle>
                      <CardDescription>{group.description}</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className={`grid grid-cols-1 ${group.fields.length > 2 ? 'md:grid-cols-2 lg:grid-cols-3' : 'md:grid-cols-2'} gap-4`}>
                        {group.fields
                          .filter(fieldKey => field_metadata[fieldKey])
                          .map(fieldKey => renderField(fieldKey, field_metadata[fieldKey]))}
                      </div>
                    </CardContent>
                  </Card>
                </TabsContent>
              ))}
          </Tabs>

          <div className="flex flex-col sm:flex-row justify-end gap-2 pt-4 border-t">
            {editConfigId ? (
              <>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => window.location.href = `/projects/${projectId}/configs`}
                >
                  Cancel Editing
                </Button>
                <Button type="submit">
                  Update Configuration
                </Button>
              </>
            ) : cloneConfigId ? (
              <>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => window.location.href = `/projects/${projectId}/configs`}
                >
                  Cancel Cloning
                </Button>
                <Button type="submit">
                  Clone Configuration
                </Button>
              </>
            ) : (
              <>
                <Button type="button" variant="outline" onClick={() => {
                  // Reset form to defaults
                  if (configSchema?.defaults) {
                    const defaultsWithDataset = { ...configSchema.defaults }
                    // Set dataset from first available if any
                    if (datasets && datasets.length > 0) {
                      defaultsWithDataset.root = datasets[0].root_path
                    }
                    setFormValues(defaultsWithDataset)
                    setName('baseline')
                    setGroupId(undefined)
                  }
                }}>
                  Reset to Defaults
                </Button>
                <Button type="submit">
                  Create Configuration
                </Button>
              </>
            )}
          </div>
        </form>
      </CardContent>
    </Card>
  )
}