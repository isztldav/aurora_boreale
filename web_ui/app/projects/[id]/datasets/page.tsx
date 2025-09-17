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
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogTrigger, DialogTitle } from '@/components/ui/dialog'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Checkbox } from '@/components/ui/checkbox'
import { toast } from 'sonner'
import { SmartDatasetSelector } from '@/components/datasets/smart-dataset-selector'
import { DatasetViewer } from '@/components/datasets/dataset-viewer'
import { NewDatasetDialog } from '@/components/datasets/new-dataset-dialog'

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
        <div className="p-4 border-b flex flex-col sm:flex-row sm:items-center gap-4">
          <h2 className="text-sm font-medium">Datasets</h2>
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 sm:ml-auto">
            <Input
              placeholder="Search datasets"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              className="w-full sm:w-[240px]"
            />
            <NewDatasetDialog projectId={projectId} onCreated={() => qc.invalidateQueries({ queryKey: ['datasets', { projectId }] })} />
          </div>
        </div>

        {isLoading ? (
          <div className="p-4">Loading...</div>
        ) : error ? (
          <div className="p-4 text-red-600">Failed to load datasets</div>
        ) : filtered.length === 0 ? (
          <div className="p-4 text-sm text-muted-foreground">No datasets found.</div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <THead>
                <TR>
                  <TH className="min-w-[120px]">Name</TH>
                  <TH className="min-w-[200px] hidden sm:table-cell">Root</TH>
                  <TH className="min-w-[100px]">Status</TH>
                  <TH className="min-w-[120px] text-right">Actions</TH>
                </TR>
              </THead>
              <TBody>
                {filtered.map((d: any) => (
                  <TR key={d.id}>
                    <TD className="font-medium">
                      <div className="truncate max-w-[120px] sm:max-w-none">{d.name}</div>
                      {/* Show root path on mobile below name */}
                      <div className="sm:hidden text-xs text-muted-foreground truncate max-w-[120px]" title={d.root_path}>
                        {d.root_path}
                      </div>
                    </TD>
                    <TD className="hidden sm:table-cell">
                      <div className="truncate max-w-[200px] lg:max-w-[300px]" title={d.root_path}>
                        {d.root_path}
                      </div>
                    </TD>
                    <TD>
                      {d.sample_stats ? (
                        <Badge variant="outline" className="text-xs whitespace-nowrap">
                          {d.sample_stats.total_samples?.toLocaleString() || 0} samples
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="text-xs text-muted-foreground whitespace-nowrap">
                          Not analyzed
                        </Badge>
                      )}
                    </TD>
                    <TD className="text-right">
                      <div className="flex items-center gap-1 sm:gap-2 justify-end">
                        <DatasetViewer dataset={d} onUpdate={() => qc.invalidateQueries({ queryKey: ['datasets', { projectId }] })} />
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => apiEx.datasets.delete(d.id).then(() => qc.invalidateQueries({ queryKey: ['datasets', { projectId }] }))}
                        >
                          <span className="hidden sm:inline">Delete</span>
                          <span className="sm:hidden">Del</span>
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
    </Shell>
  )
}

