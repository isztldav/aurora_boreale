"use client"

import { useQuery, useQueryClient } from '@tanstack/react-query'
import { apiEx } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { toast } from 'sonner'

interface DeleteConfigDialogProps {
  configId: string | null
  projectId: string
  onOpenChange: (open: boolean) => void
}

export function DeleteConfigDialog({ configId, projectId, onOpenChange }: DeleteConfigDialogProps) {
  const qc = useQueryClient()
  const { data: config } = useQuery({
    queryKey: ['config', { id: configId }],
    queryFn: () => apiEx.configs.get(configId!),
    enabled: !!configId,
  })

  const handleDelete = async () => {
    if (!configId) return
    try {
      await apiEx.configs.delete(configId)
      qc.invalidateQueries({ queryKey: ['configs', { projectId }] })
      onOpenChange(false)
      toast.success('Configuration deleted successfully')
    } catch (e: any) {
      toast.error(e?.message || 'Failed to delete configuration')
    }
  }

  return (
    <Dialog open={!!configId} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogTitle>Delete Configuration</DialogTitle>
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Are you sure you want to delete the configuration "{config?.name}"? This action cannot be undone.
          </p>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleDelete}>
              Delete
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}