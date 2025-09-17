"use client"

import { useState, useEffect } from 'react'
import { apiEx, Model } from '@/lib/api'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { ModelAutocomplete } from '@/components/ui/model-autocomplete'
import { toast } from 'sonner'
import { EyeIcon, EyeOffIcon } from 'lucide-react'

interface EditModelDialogProps {
  model: Model | null
  existingModels: Model[]
  onOpenChange: (open: boolean) => void
  onUpdated: () => void
}

export function EditModelDialog({
  model,
  existingModels,
  onOpenChange,
  onUpdated
}: EditModelDialogProps) {
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