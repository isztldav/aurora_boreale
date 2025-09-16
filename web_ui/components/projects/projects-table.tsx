"use client"

import * as React from 'react'
import Link from 'next/link'
import { useQuery } from '@tanstack/react-query'
import { api, type Project } from '@/lib/api'
import { Table, THead, TBody, TR, TH, TD } from '@/components/ui/table'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Calendar } from '@/components/ui/calendar'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Dialog, DialogContent, DialogTrigger, DialogTitle } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { toast } from 'sonner'
import { formatDateTime } from '@/lib/utils'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { useQueryClient } from '@tanstack/react-query'

export function ProjectsTable() {
  const { data = [], isLoading, error } = useQuery({ queryKey: ['projects'], queryFn: api.projects.list })
  const qc = useQueryClient()
  const [selected, setSelected] = React.useState<Record<string, boolean>>({})
  const [q, setQ] = React.useState('')
  const [dateFrom, setDateFrom] = React.useState<Date | undefined>(undefined)
  const [dateTo, setDateTo] = React.useState<Date | undefined>(undefined)
  const [view, setView] = React.useState<'all' | 'recent'>('all')
  const [editProject, setEditProject] = React.useState<Project | null>(null)

  const filtered = React.useMemo(() => {
    let res = data
    if (view === 'recent') {
      const since = new Date(Date.now() - 7 * 86400_000)
      res = res.filter((p) => new Date(p.created_at) >= since)
    }
    if (q) res = res.filter((p) => p.name.toLowerCase().includes(q.toLowerCase()))
    if (dateFrom) res = res.filter((p) => new Date(p.created_at) >= dateFrom)
    if (dateTo) res = res.filter((p) => new Date(p.created_at) <= dateTo)
    return res
  }, [data, q, dateFrom, dateTo])

  const allSelected = filtered.length > 0 && filtered.every((p) => selected[p.id])
  const toggleAll = (v: boolean) => {
    const next: Record<string, boolean> = { ...selected }
    filtered.forEach((p) => (next[p.id] = v))
    setSelected(next)
  }

  return (
    <div className="space-y-4">
      <KPIHeader projects={data} />
      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-2">
          <Tabs value={view} onValueChange={(v) => setView(v as any)}>
            <TabsList>
              <TabsTrigger value="all">All</TabsTrigger>
              <TabsTrigger value="recent">Recent</TabsTrigger>
            </TabsList>
            <TabsContent value="all" />
            <TabsContent value="recent" />
          </Tabs>
          <div className="flex items-center gap-2">
            <Input placeholder="Search projects" value={q} onChange={(e) => setQ(e.target.value)} className="w-[240px]" />
            <Popover>
              <PopoverTrigger asChild><Button variant="outline">Date</Button></PopoverTrigger>
              <PopoverContent align="end">
                <div className="space-y-2">
                  <div>
                    <div className="text-xs text-muted-foreground mb-1">From</div>
                    <Calendar mode="single" selected={dateFrom} onSelect={setDateFrom} />
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground mb-1">To</div>
                    <Calendar mode="single" selected={dateTo} onSelect={setDateTo} />
                  </div>
                  <Button variant="ghost" size="sm" onClick={() => { setDateFrom(undefined); setDateTo(undefined) }}>Clear</Button>
                </div>
              </PopoverContent>
            </Popover>
            <NewProjectDialog />
            <BulkActions selected={Object.keys(selected).filter((k) => selected[k])} />
          </div>
        </div>
        <div className="rounded-lg border">
          {isLoading ? (
            <div className="p-4 text-sm text-muted-foreground">Loading projects…</div>
          ) : error ? (
            <div className="p-4 text-sm text-red-600">Failed to load projects</div>
          ) : filtered.length === 0 ? (
            <div className="p-6 text-sm text-muted-foreground">No projects found.</div>
          ) : (
            <Table>
              <THead>
                <TR>
                  <TH className="w-[36px]"><Checkbox checked={allSelected} onCheckedChange={(v) => toggleAll(Boolean(v))} /></TH>
                  <TH>Name</TH>
                  <TH>Created</TH>
                  <TH>Description</TH>
                  <TH className="text-right">Actions</TH>
                </TR>
              </THead>
              <TBody>
                {filtered.map((p) => (
                  <TR key={p.id}>
                    <TD><Checkbox checked={!!selected[p.id]} onCheckedChange={(v) => setSelected((s) => ({ ...s, [p.id]: Boolean(v) }))} /></TD>
                    <TD className="font-medium"><Link className="hover:underline" href={`/projects/${p.id}`}>{p.name}</Link></TD>
                    <TD className="text-muted-foreground">{formatDateTime(p.created_at)}</TD>
                    <TD className="truncate max-w-[520px]">{p.description || '—'}</TD>
                    <TD className="text-right">
                      <div className="flex items-center gap-1 justify-end">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setEditProject(p)}
                        >
                          Edit
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={async () => {
                            if (confirm(`Delete project "${p.name}"? This action cannot be undone.`)) {
                              try {
                                await api.projects.delete(p.id)
                                qc.invalidateQueries({ queryKey: ['projects'] })
                                toast.success('Project deleted')
                              } catch (e: any) {
                                toast.error(e?.message || 'Failed to delete project')
                              }
                            }
                          }}
                        >
                          Delete
                        </Button>
                      </div>
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          )}
        </div>
      </div>
      <EditProjectDialog project={editProject} onOpenChange={(open) => !open && setEditProject(null)} />
    </div>
  )
}

function KPIHeader({ projects }: { projects: Project[] }) {
  const total = projects.length
  const last7 = projects.filter((p) => Date.now() - new Date(p.created_at).getTime() < 7 * 86400_000).length
  const delta = last7
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      <div className="rounded-lg border p-4">
        <div className="text-xs text-muted-foreground">Total Projects</div>
        <div className="text-2xl font-semibold">{total} <Badge className="ml-2" variant="success">+{delta} last 7d</Badge></div>
        <Link href="#" className="text-xs text-muted-foreground hover:underline">View details</Link>
      </div>
      <div className="rounded-lg border p-4">
        <div className="text-xs text-muted-foreground">Active Agents</div>
        <div className="text-2xl font-semibold">—</div>
        <span className="text-xs text-muted-foreground">Coming soon</span>
      </div>
      <div className="rounded-lg border p-4">
        <div className="text-xs text-muted-foreground">Queued Runs</div>
        <div className="text-2xl font-semibold">—</div>
        <span className="text-xs text-muted-foreground">Coming soon</span>
      </div>
      <div className="rounded-lg border p-4">
        <div className="text-xs text-muted-foreground">Succeeded Runs</div>
        <div className="text-2xl font-semibold">—</div>
        <span className="text-xs text-muted-foreground">Coming soon</span>
      </div>
    </div>
  )
}

function NewProjectDialog() {
  const [open, setOpen] = React.useState(false)
  const [name, setName] = React.useState('')
  const [desc, setDesc] = React.useState('')
  const submit = async () => {
    try {
      await api.projects.create({ name, description: desc || undefined })
      setOpen(false)
      setName('')
      setDesc('')
      toast.success('Project created')
    } catch (e: any) {
      toast.error(e?.message || 'Failed to create project')
    }
  }
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>New Project</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogTitle>New Project</DialogTitle>
        <div className="space-y-3">
          <div>
            <Label htmlFor="name">Name</Label>
            <Input id="name" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="desc">Description</Label>
            <Textarea id="desc" value={desc} onChange={(e) => setDesc(e.target.value)} />
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={submit} disabled={!name.trim()}>Create</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

function EditProjectDialog({ project, onOpenChange }: { project: Project | null; onOpenChange: (open: boolean) => void }) {
  const qc = useQueryClient()
  const [name, setName] = React.useState('')
  const [desc, setDesc] = React.useState('')

  React.useEffect(() => {
    if (project) {
      setName(project.name)
      setDesc(project.description || '')
    }
  }, [project])

  const submit = async () => {
    if (!project) return
    try {
      await api.projects.update(project.id, {
        name: name.trim(),
        description: desc.trim() || undefined
      })
      qc.invalidateQueries({ queryKey: ['projects'] })
      onOpenChange(false)
      toast.success('Project updated')
    } catch (e: any) {
      toast.error(e?.message || 'Failed to update project')
    }
  }

  return (
    <Dialog open={!!project} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogTitle>Edit Project</DialogTitle>
        <div className="space-y-3">
          <div>
            <Label htmlFor="edit-name">Name</Label>
            <Input id="edit-name" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="edit-desc">Description</Label>
            <Textarea id="edit-desc" value={desc} onChange={(e) => setDesc(e.target.value)} />
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button onClick={submit} disabled={!name.trim()}>Update</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

function BulkActions({ selected }: { selected: string[] }) {
  const qc = useQueryClient()
  const disabled = selected.length === 0

  const handleBulkDelete = async () => {
    if (selected.length === 0) return

    const confirmText = `Delete ${selected.length} project${selected.length !== 1 ? 's' : ''}? This action cannot be undone.`
    if (!confirm(confirmText)) return

    try {
      await Promise.all(selected.map(id => api.projects.delete(id)))
      qc.invalidateQueries({ queryKey: ['projects'] })
      toast.success(`Deleted ${selected.length} project${selected.length !== 1 ? 's' : ''}`)
    } catch (e: any) {
      toast.error(e?.message || 'Failed to delete projects')
    }
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" disabled={disabled}>Actions</Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={handleBulkDelete}>
          Delete ({selected.length})
        </DropdownMenuItem>
        <DropdownMenuItem disabled>Export (soon)</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
