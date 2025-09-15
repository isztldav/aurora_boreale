"use client"

import { useParams } from 'next/navigation'
import { useMemo, useState, useEffect } from 'react'
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
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Switch } from '@/components/ui/switch'
import { ModelAutocomplete } from '@/components/ui/model-autocomplete'
import { toast } from 'sonner'
import { EyeIcon, EyeOffIcon, PencilIcon, TrashIcon } from 'lucide-react'

export default function ProjectModelsPage() {
  const params = useParams<{ id: string }>()
  const projectId = params.id
  const qc = useQueryClient()
  const { data = [], isLoading, error } = useQuery({ queryKey: ['models', { projectId }], queryFn: () => apiEx.models.list(projectId) })
  const [q, setQ] = useState('')
  const [editingModel, setEditingModel] = useState<Model | null>(null)
  const [deleteModel, setDeleteModel] = useState<Model | null>(null)
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
                  <TH className="min-w-[80px] hidden md:table-cell">Token</TH>
                  <TH className="min-w-[120px] hidden lg:table-cell">Notes</TH>
                  <TH className="min-w-[120px] text-right">Actions</TH>
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
                    <TD className="hidden md:table-cell">
                      <Badge variant={m.has_token ? "default" : "outline"} className="text-xs">
                        {m.has_token ? "Private" : "Public"}
                      </Badge>
                    </TD>
                    <TD className="hidden lg:table-cell">
                      <div className="truncate max-w-[120px] xl:max-w-[200px]" title={m.notes || ''}>
                        {m.notes || '-'}
                      </div>
                    </TD>
                    <TD className="text-right">
                      <div className="flex items-center gap-1 justify-end">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setEditingModel(m)}
                        >
                          <PencilIcon className="h-4 w-4 sm:hidden" />
                          <span className="hidden sm:inline">Edit</span>
                        </Button>
                        <Button
                          variant="destructive"
                          size="sm"
                          onClick={() => setDeleteModel(m)}
                        >
                          <TrashIcon className="h-4 w-4 sm:hidden" />
                          <span className="hidden sm:inline">Delete</span>
                        </Button>
                      </div>
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </div>
        )}
      </div>

      {/* Edit Model Dialog */}
      <EditModelDialog
        model={editingModel}
        existingModels={data}
        onOpenChange={(open) => !open && setEditingModel(null)}
        onUpdated={() => qc.invalidateQueries({ queryKey: ['models', { projectId }] })}
      />

      {/* Delete Model Dialog */}
      <DeleteModelDialog
        model={deleteModel}
        onOpenChange={(open) => !open && setDeleteModel(null)}
        onDeleted={() => qc.invalidateQueries({ queryKey: ['models', { projectId }] })}
      />
    </Shell>
  )
}

function NewModelDialog({ projectId, existingModels, onCreated }: { projectId: string; existingModels: Model[]; onCreated: () => void }) {
  const [open, setOpen] = useState(false)
  const [label, setLabel] = useState('')
  const [ckpt, setCkpt] = useState('')
  const [hfToken, setHfToken] = useState('')
  const [showToken, setShowToken] = useState(false)
  const [notes, setNotes] = useState('')
  const [error, setError] = useState('')

  const isDuplicate = Boolean(ckpt && existingModels.some(m => m.hf_checkpoint_id === ckpt))

  const submit = async () => {
    if (isDuplicate) {
      setError('This checkpoint is already registered in the project')
      return
    }
    try {
      await apiEx.models.create(projectId, {
        label,
        hf_checkpoint_id: ckpt,
        hf_token: hfToken || undefined,
        notes
      })
      setOpen(false)
      resetForm()
      onCreated()
      toast.success('Model created successfully')
    } catch (err: any) {
      setError(err?.message || 'Failed to create model. Please try again.')
    }
  }

  const resetForm = () => {
    setLabel('')
    setCkpt('')
    setHfToken('')
    setShowToken(false)
    setNotes('')
    setError('')
  }
  return (
    <Dialog open={open} onOpenChange={(open) => { setOpen(open); if (!open) resetForm(); }}>
      <DialogTrigger asChild>
        <Button>New Model</Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogTitle>Add New Model</DialogTitle>
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Model Configuration</CardTitle>
            <CardDescription>
              Register a HuggingFace model for use in your training configurations.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="label">Model Label</Label>
              <Input
                id="label"
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder="e.g., ResNet-50 v2, My Custom ViT"
              />
              <p className="text-xs text-muted-foreground">
                A friendly name for this model in your project
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="ckpt">HuggingFace Model ID</Label>
              <ModelAutocomplete
                value={ckpt}
                onValueChange={(value) => { setCkpt(value); setError('') }}
                placeholder="Search for a HuggingFace model..."
              />
              {isDuplicate && (
                <p className="text-xs text-red-600">
                  This checkpoint is already registered in the project
                </p>
              )}
              {!isDuplicate && (
                <p className="text-xs text-muted-foreground">
                  The HuggingFace model ID (e.g., microsoft/resnet-50)
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="hf-token">HuggingFace Token (Optional)</Label>
              <div className="relative">
                <Input
                  id="hf-token"
                  type={showToken ? "text" : "password"}
                  value={hfToken}
                  onChange={(e) => setHfToken(e.target.value)}
                  placeholder="hf_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                  onClick={() => setShowToken(!showToken)}
                >
                  {showToken ? (
                    <EyeOffIcon className="h-4 w-4" />
                  ) : (
                    <EyeIcon className="h-4 w-4" />
                  )}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Required only for private models. Tokens are stored securely and never exposed in configs.
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="notes">Notes (Optional)</Label>
              <Textarea
                id="notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Optional description, training details, or other notes..."
                rows={3}
              />
            </div>

            {error && !isDuplicate && (
              <div className="text-sm text-red-600 bg-red-50 p-3 rounded">
                {error}
              </div>
            )}

            <div className="flex justify-end gap-2 pt-4">
              <Button variant="outline" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button onClick={submit} disabled={!label || !ckpt || isDuplicate}>
                Add Model
              </Button>
            </div>
          </CardContent>
        </Card>
      </DialogContent>
    </Dialog>
  )
}

function EditModelDialog({
  model,
  existingModels,
  onOpenChange,
  onUpdated
}: {
  model: Model | null
  existingModels: Model[]
  onOpenChange: (open: boolean) => void
  onUpdated: () => void
}) {
  const [label, setLabel] = useState('')
  const [ckpt, setCkpt] = useState('')
  const [hfToken, setHfToken] = useState('')
  const [showToken, setShowToken] = useState(false)
  const [notes, setNotes] = useState('')
  const [error, setError] = useState('')

  // Populate form when model changes
  useEffect(() => {
    if (model) {
      setLabel(model.label)
      setCkpt(model.hf_checkpoint_id)
      setHfToken('') // Don't pre-fill token for security
      setNotes(model.notes || '')
      setError('')
    }
  }, [model])

  const isDuplicate = Boolean(
    ckpt &&
    model &&
    existingModels.some(m => m.id !== model.id && m.hf_checkpoint_id === ckpt)
  )

  const submit = async () => {
    if (!model || isDuplicate) return

    try {
      await apiEx.models.update(model.id, {
        label,
        hf_checkpoint_id: ckpt,
        hf_token: hfToken || undefined,
        notes
      })
      onOpenChange(false)
      onUpdated()
      toast.success('Model updated successfully')
    } catch (err: any) {
      setError(err?.message || 'Failed to update model. Please try again.')
    }
  }

  return (
    <Dialog open={!!model} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogTitle>Edit Model</DialogTitle>
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Update Model Configuration</CardTitle>
            <CardDescription>
              Modify the model settings. Leave token field empty to keep existing token.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="edit-label">Model Label</Label>
              <Input
                id="edit-label"
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder="e.g., ResNet-50 v2, My Custom ViT"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="edit-ckpt">HuggingFace Model ID</Label>
              <ModelAutocomplete
                value={ckpt}
                onValueChange={(value) => { setCkpt(value); setError('') }}
                placeholder="Search for a HuggingFace model..."
              />
              {isDuplicate && (
                <p className="text-xs text-red-600">
                  This checkpoint is already registered in the project
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="edit-hf-token">HuggingFace Token</Label>
              <div className="relative">
                <Input
                  id="edit-hf-token"
                  type={showToken ? "text" : "password"}
                  value={hfToken}
                  onChange={(e) => setHfToken(e.target.value)}
                  placeholder={model?.has_token ? "Leave empty to keep existing token" : "hf_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"}
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                  onClick={() => setShowToken(!showToken)}
                >
                  {showToken ? (
                    <EyeOffIcon className="h-4 w-4" />
                  ) : (
                    <EyeIcon className="h-4 w-4" />
                  )}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                {model?.has_token
                  ? "Model currently has a token. Leave empty to keep it, or enter new token to replace."
                  : "Enter token if this model is private."
                }
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="edit-notes">Notes (Optional)</Label>
              <Textarea
                id="edit-notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Optional description, training details, or other notes..."
                rows={3}
              />
            </div>

            {error && (
              <div className="text-sm text-red-600 bg-red-50 p-3 rounded">
                {error}
              </div>
            )}

            <div className="flex justify-end gap-2 pt-4">
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button onClick={submit} disabled={!label || !ckpt || isDuplicate}>
                Update Model
              </Button>
            </div>
          </CardContent>
        </Card>
      </DialogContent>
    </Dialog>
  )
}

function DeleteModelDialog({
  model,
  onOpenChange,
  onDeleted
}: {
  model: Model | null
  onOpenChange: (open: boolean) => void
  onDeleted: () => void
}) {
  const [isDeleting, setIsDeleting] = useState(false)

  const handleDelete = async () => {
    if (!model) return

    setIsDeleting(true)
    try {
      await apiEx.models.delete(model.id)
      onOpenChange(false)
      onDeleted()
      toast.success('Model deleted successfully')
    } catch (err: any) {
      toast.error(err?.message || 'Failed to delete model')
    } finally {
      setIsDeleting(false)
    }
  }

  return (
    <Dialog open={!!model} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogTitle>Delete Model</DialogTitle>
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Are you sure you want to delete the model "{model?.label}"? This action cannot be undone.
          </p>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isDeleting}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleDelete} disabled={isDeleting}>
              {isDeleting ? 'Deleting...' : 'Delete Model'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
