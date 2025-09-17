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
import { NewModelDialog } from '@/components/models/new-model-dialog'
import { EditModelDialog } from '@/components/models/edit-model-dialog'
import { DeleteModelDialog } from '@/components/models/delete-model-dialog'

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

