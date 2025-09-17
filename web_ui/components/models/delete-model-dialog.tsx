"use client"

import { useState } from 'react'
import { apiEx, Model } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { toast } from 'sonner'

interface DeleteModelDialogProps {
  model: Model | null
  onOpenChange: (open: boolean) => void
  onDeleted: () => void
}

export function DeleteModelDialog({
  model,
  onOpenChange,
  onDeleted
}: DeleteModelDialogProps) {
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