"use client"

import { useState } from 'react'
import { apiEx } from '@/lib/api'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogTrigger, DialogTitle } from '@/components/ui/dialog'
import { SmartDatasetSelector } from '@/components/datasets/smart-dataset-selector'
import { toast } from 'sonner'

interface NewDatasetDialogProps {
  projectId: string
  onCreated: () => void
}

export function NewDatasetDialog({ projectId, onCreated }: NewDatasetDialogProps) {
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [root, setRoot] = useState('')
  const [datasetStructure, setDatasetStructure] = useState<any>(null)

  const submit = async () => {
    // Validate structure before creation
    if (datasetStructure && !datasetStructure.is_valid) {
      toast.error('Dataset structure is invalid. Please ensure your dataset follows the train/val/test ImageFolder format.')
      return
    }

    if (!datasetStructure) {
      toast.error('Please analyze the dataset structure before creating.')
      return
    }

    try {
      // Include analyzed structure
      const payload: any = {
        name,
        root_path: root,
        split_layout: {
          splits: datasetStructure.splits,
          classes: datasetStructure.classes
        },
        class_map: datasetStructure.classes.reduce((acc: any, cls: string, idx: number) => {
          acc[cls] = idx
          return acc
        }, {}),
        sample_stats: {
          total_samples: datasetStructure.total_samples,
          class_counts: datasetStructure.class_counts
        }
      }

      await apiEx.datasets.create(projectId, payload)
      setOpen(false)
      setName('')
      setRoot('')
      setDatasetStructure(null)
      onCreated()
      toast.success('Dataset created successfully')
    } catch (e: any) {
      toast.error(e?.message || 'Failed to create dataset')
    }
  }

  const handleDatasetAnalyzed = (structure: any) => {
    setDatasetStructure(structure)
    // Auto-populate name if not set
    if (!name && structure.path) {
      const pathParts = structure.path.split('/')
      const folderName = pathParts[pathParts.length - 1]
      setName(folderName)
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>New Dataset</Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogTitle>New Dataset</DialogTitle>
        <div className="space-y-4">
          <div>
            <Label htmlFor="ds-name">Dataset Name</Label>
            <Input
              id="ds-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="my-dataset"
            />
          </div>

          <SmartDatasetSelector
            value={root}
            onChange={setRoot}
            onDatasetAnalyzed={handleDatasetAnalyzed}
          />

          <div className="flex justify-end gap-2 pt-4">
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button
              onClick={submit}
              disabled={!name || !root || !datasetStructure || (datasetStructure && !datasetStructure.is_valid)}
            >
              Create Dataset
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}