"use client"

import { useParams, useSearchParams } from 'next/navigation'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { api, apiEx, Model } from '@/lib/api'
import { Shell } from '@/components/shell/shell'
import { ProjectNav } from '@/components/projects/project-nav'
import { Table, THead, TBody, TR, TH, TD } from '@/components/ui/table'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ConfigInspectDialog } from '@/components/projects/config-inspect-dialog'
import { DynamicConfigForm } from '@/components/projects/dynamic-config-form'
import { QueueRunDialog } from '@/components/projects/queue-run-dialog'
import { DeleteConfigDialog } from '@/components/projects/delete-config-dialog'

export default function ProjectConfigsPage() {
  const params = useParams<{ id: string }>()
  const searchParams = useSearchParams()
  const projectId = params.id
  const editConfigId = searchParams.get('edit')
  const cloneConfigId = searchParams.get('clone')
  const qc = useQueryClient()
  const { data, isLoading, error } = useQuery({ queryKey: ['configs', { projectId }], queryFn: () => apiEx.configs.list(projectId) })
  const { data: groups } = useQuery({ queryKey: ['groups', { projectId }], queryFn: () => api.groups.list(projectId) })
  const { data: models } = useQuery<Model[]>({ queryKey: ['models', { projectId }], queryFn: () => apiEx.models.list(projectId) })
  const { data: datasets } = useQuery({ queryKey: ['datasets', { projectId }], queryFn: () => apiEx.datasets.list(projectId) })

  // State for delete dialog
  const [deleteConfigId, setDeleteConfigId] = useState<string | null>(null)

  // State for inspect dialog
  const [inspectConfigId, setInspectConfigId] = useState<string | null>(null)

  return (
    <Shell>
      <ProjectNav projectId={projectId} current="configs" />
      <div className="space-y-6">
        {/* Existing Configs */}
        <div className="rounded-lg border">
          <div className="p-4 border-b flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <h2 className="text-sm font-medium">Training Configurations</h2>
            <Badge variant="default">{data?.length || 0} configs</Badge>
          </div>
          {isLoading ? <div className="p-4">Loading...</div> : error ? <div className="p-4 text-red-600">Failed to load configs</div> : (
            <div className="overflow-x-auto">
              <Table>
                <THead>
                  <TR>
                    <TH className="min-w-[120px]">Name</TH>
                    <TH className="min-w-[80px]">Version</TH>
                    <TH className="min-w-[80px]">Status</TH>
                    <TH className="min-w-[120px] text-right">Actions</TH>
                  </TR>
                </THead>
                <TBody>
                  {data?.map((c) => (
                    <TR key={c.id}>
                      <TD className="font-medium">
                        <button
                          onClick={() => setInspectConfigId(c.id)}
                          className="hover:underline cursor-pointer"
                        >
                          {c.name}
                        </button>
                      </TD>
                      <TD>{c.version}</TD>
                      <TD>{c.status}</TD>
                      <TD className="text-right">
                        <div className="flex items-center gap-1 justify-end">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => window.open(`/projects/${projectId}/configs?edit=${c.id}`, '_self')}
                          >
                            Edit
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => window.open(`/projects/${projectId}/configs?clone=${c.id}`, '_self')}
                          >
                            Clone
                          </Button>
                          <Button
                            size="sm"
                            variant="destructive"
                            onClick={() => setDeleteConfigId(c.id)}
                          >
                            Delete
                          </Button>
                          <QueueRunDialog projectId={projectId} configId={c.id} />
                        </div>
                      </TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            </div>
          )}
        </div>

        {/* Config Form (New/Edit) */}
        <DynamicConfigForm
          projectId={projectId}
          editConfigId={editConfigId}
          cloneConfigId={cloneConfigId}
          groups={groups || []}
          models={models || []}
          datasets={datasets || []}
          onCreated={() => qc.invalidateQueries({ queryKey: ['configs', { projectId }] })}
        />

        {/* Delete Dialog */}
        <DeleteConfigDialog
          configId={deleteConfigId}
          projectId={projectId}
          onOpenChange={(v: boolean) => !v && setDeleteConfigId(null)}
        />

        {/* Inspect Dialog */}
        <ConfigInspectDialog
          configId={inspectConfigId}
          onOpenChange={(v: boolean) => !v && setInspectConfigId(null)}
        />
      </div>
    </Shell>
  )
}



