"use client"

import { useState } from 'react'
import { apiEx, Model } from '@/lib/api'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogTrigger, DialogTitle } from '@/components/ui/dialog'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { ModelAutocomplete } from '@/components/ui/model-autocomplete'
import { toast } from 'sonner'
import { EyeIcon, EyeOffIcon } from 'lucide-react'

interface NewModelDialogProps {
  projectId: string
  existingModels: Model[]
  onCreated: () => void
}

export function NewModelDialog({ projectId, existingModels, onCreated }: NewModelDialogProps) {
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