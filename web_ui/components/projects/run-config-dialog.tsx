"use client"

import { useState, useEffect } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { apiEx, type Tag } from '@/lib/api'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { Checkbox } from '@/components/ui/checkbox'
import { ScrollArea } from '@/components/ui/scroll-area'
import { toast } from 'sonner'

interface RunConfigDialogProps {
  run: { id: string; name: string; config_id: string; project_id: string } | null
  onOpenChange: (open: boolean) => void
}

export function RunConfigDialog({ run, onOpenChange }: RunConfigDialogProps) {
  const qc = useQueryClient()
  const [isEditingTags, setIsEditingTags] = useState(false)
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>([])
  const [isUpdatingTags, setIsUpdatingTags] = useState(false)

  const { data: config, isLoading: configLoading, error: configError } = useQuery({
    queryKey: ['config', { id: run?.config_id }],
    queryFn: () => apiEx.configs.get(run!.config_id),
    enabled: !!run?.config_id,
  })

  const { data: runTags } = useQuery({
    queryKey: ['run-tags', { runId: run?.id }],
    queryFn: () => apiEx.tags.getRunTags(run!.id),
    enabled: !!run?.id,
  })

  const { data: allTags } = useQuery({
    queryKey: ['project-tags', { projectId: run?.project_id }],
    queryFn: () => apiEx.tags.getProjectTags(run!.project_id),
    enabled: !!run && isEditingTags,
  })

  useEffect(() => {
    if (runTags) {
      setSelectedTagIds(runTags.map(tag => tag.id))
    }
  }, [runTags])

  const handleTagToggle = (tagId: string) => {
    setSelectedTagIds(prev =>
      prev.includes(tagId)
        ? prev.filter(id => id !== tagId)
        : [...prev, tagId]
    )
  }

  const handleSaveTags = async () => {
    if (!run) return

    setIsUpdatingTags(true)
    try {
      await apiEx.tags.assignToRun(run.id, selectedTagIds)
      qc.invalidateQueries({ queryKey: ['run-tags', { runId: run.id }] })
      toast.success('Tags updated successfully')
      setIsEditingTags(false)
    } catch (error) {
      toast.error('Failed to update tags')
      console.error('Error updating tags:', error)
    } finally {
      setIsUpdatingTags(false)
    }
  }

  const handleCancelTagEdit = () => {
    setIsEditingTags(false)
    if (runTags) {
      setSelectedTagIds(runTags.map(tag => tag.id))
    }
  }

  return (
    <Dialog open={!!run} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[900px] w-[95vw]">
        <div className="flex items-center justify-between mb-2">
          <DialogTitle>Run Config{run ? ` • ${run.name}` : ''}</DialogTitle>
        </div>

        {/* Tags Section */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-medium">Tags</h3>
            <Button
              variant={isEditingTags ? "outline" : "secondary"}
              size="sm"
              onClick={() => isEditingTags ? handleCancelTagEdit() : setIsEditingTags(true)}
              disabled={isUpdatingTags}
            >
              {isEditingTags ? 'Cancel' : 'Edit Tags'}
            </Button>
          </div>

          {isEditingTags ? (
            <div className="space-y-3">
              <ScrollArea className="h-32 border rounded p-2">
                {allTags?.map(tag => (
                  <div key={tag.id} className="flex items-center gap-2 py-1">
                    <Checkbox
                      checked={selectedTagIds.includes(tag.id)}
                      onCheckedChange={() => handleTagToggle(tag.id)}
                    />
                    <span className="text-sm">{tag.path}</span>
                  </div>
                ))}
                {(!allTags || allTags.length === 0) && (
                  <div className="text-sm text-muted-foreground p-2">No tags available</div>
                )}
              </ScrollArea>
              <div className="flex justify-end gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleCancelTagEdit}
                  disabled={isUpdatingTags}
                >
                  Cancel
                </Button>
                <Button
                  size="sm"
                  onClick={handleSaveTags}
                  disabled={isUpdatingTags}
                >
                  {isUpdatingTags ? 'Saving...' : 'Save'}
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex flex-wrap gap-1">
              {runTags && runTags.length > 0 ? (
                runTags.map(tag => (
                  <Badge key={tag.id} variant="secondary" className="text-xs">
                    {tag.path}
                  </Badge>
                ))
              ) : (
                <span className="text-sm text-muted-foreground">No tags assigned</span>
              )}
            </div>
          )}
        </div>

        <Separator />

        {/* Config Section */}
        {configLoading ? (
          <div className="text-sm">Loading config…</div>
        ) : configError ? (
          <div className="text-sm text-red-600">Failed to load config</div>
        ) : config ? (
          <div className="space-y-3">
            <div className="text-sm text-muted-foreground">Config "{config.name}" • v{config.version} • {config.status}</div>
            <pre className="text-xs bg-muted p-3 rounded overflow-auto max-h-[50vh]">
{JSON.stringify(config.config_json, null, 2)}
            </pre>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  )
}