"use client"

import { useParams } from 'next/navigation'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useMemo, useState } from 'react'
import { apiEx } from '@/lib/api'
import { Shell } from '@/components/shell/shell'
import { ProjectNav } from '@/components/projects/project-nav'
import { Table, THead, TBody, TR, TH, TD } from '@/components/ui/table'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogTrigger, DialogTitle } from '@/components/ui/dialog'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Checkbox } from '@/components/ui/checkbox'
import { toast } from 'sonner'
import { SmartDatasetSelector } from '@/components/datasets/smart-dataset-selector'

export default function ProjectDatasetsPage() {
  const params = useParams<{ id: string }>()
  const projectId = params.id
  const qc = useQueryClient()
  const { data = [], isLoading, error } = useQuery({ queryKey: ['datasets', { projectId }], queryFn: () => apiEx.datasets.list(projectId) })
  const [q, setQ] = useState('')
  const filtered = useMemo(() => (
    data.filter((d: any) => !q || d.name.toLowerCase().includes(q.toLowerCase()))
  ), [data, q])

  return (
    <Shell>
      <ProjectNav projectId={projectId} current="datasets" />
      <div className="rounded-lg border">
        <div className="p-4 border-b flex items-center justify-between gap-2">
          <h2 className="text-sm font-medium">Datasets</h2>
          <div className="flex items-center gap-2">
            <Input placeholder="Search datasets" value={q} onChange={(e) => setQ(e.target.value)} className="w-[240px]" />
            <NewDatasetDialog projectId={projectId} onCreated={() => qc.invalidateQueries({ queryKey: ['datasets', { projectId }] })} />
          </div>
        </div>
        {isLoading ? <div className="p-4">Loading...</div> : error ? <div className="p-4 text-red-600">Failed to load datasets</div> : filtered.length === 0 ? (
          <div className="p-4 text-sm text-muted-foreground">No datasets found.</div>
        ) : (
          <Table>
            <THead>
              <TR>
                <TH>Name</TH>
                <TH>Root</TH>
                <TH className="text-right">Actions</TH>
              </TR>
            </THead>
            <TBody>
              {filtered.map((d: any) => (
                <TR key={d.id}>
                  <TD className="font-medium">{d.name}</TD>
                  <TD className="truncate max-w-[560px]" title={d.root_path}>{d.root_path}</TD>
                  <TD className="text-right">
                    <Button variant="outline" size="sm" onClick={() => apiEx.datasets.delete(d.id).then(() => qc.invalidateQueries({ queryKey: ['datasets', { projectId }] }))}>Delete</Button>
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </div>
    </Shell>
  )
}

function NewDatasetDialog({ projectId, onCreated }: { projectId: string; onCreated: () => void }) {
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [root, setRoot] = useState('')
  const [datasetStructure, setDatasetStructure] = useState<any>(null)

  const submit = async () => {
    try {
      // Include analyzed structure if available
      const payload: any = { name, root_path: root }
      if (datasetStructure) {
        payload.split_layout = {
          splits: datasetStructure.splits,
          classes: datasetStructure.classes
        }
        payload.class_map = datasetStructure.classes.reduce((acc: any, cls: string, idx: number) => {
          acc[cls] = idx
          return acc
        }, {})
        payload.sample_stats = {
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
              disabled={!name || !root || (datasetStructure && !datasetStructure.is_valid)}
            >
              Create Dataset
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
