"use client"

import React, { useState } from "react"
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query"
import { Shell } from "@/components/shell/shell"
import { Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbSeparator } from "@/components/ui/breadcrumb"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { TagTreeManager, TagNode } from "@/components/tags/tag-tree-manager"
import { Tag, BarChart3, Settings, TrendingUp } from "lucide-react"
import { toast } from "sonner"
import { api, apiEx } from "@/lib/api"
import { NAV_LABELS } from "@/lib/app-config"

// API functions using the real API client
const fetchTags = async (): Promise<TagNode[]> => {
  const tags = await apiEx.tags.tree()
  return tags as TagNode[]
}

const createTag = async (name: string, projectId: string, parentId?: string): Promise<TagNode> => {
  const tag = await apiEx.tags.create({ project_id: projectId, name, parent_id: parentId })
  return { ...tag, children: [] } as TagNode
}

const updateTag = async (id: string, name: string): Promise<TagNode> => {
  const tag = await apiEx.tags.update(id, { name })
  return { ...tag, children: [] } as TagNode
}

const deleteTag = async (id: string, preserveChildren: boolean): Promise<void> => {
  await apiEx.tags.delete(id, preserveChildren)
}

const promoteTag = async (id: string): Promise<TagNode> => {
  const tag = await apiEx.tags.promote(id)
  return { ...tag, children: [] } as TagNode
}

const moveTag = async (id: string, newParentId?: string): Promise<TagNode> => {
  const tag = await apiEx.tags.move(id, newParentId)
  return { ...tag, children: [] } as TagNode
}

const fetchTagStats = async (): Promise<TagStats> => {
  // Mock for now - would need backend endpoint for statistics
  return {
    totalTags: 0,
    taggedRuns: 0,
    untaggedRuns: 0,
    mostUsedTags: [] as Array<{
      id: string
      name: string
      runCount: number
    }>
  }
}

interface TagStats {
  totalTags: number
  taggedRuns: number
  untaggedRuns: number
  mostUsedTags: Array<{
    id: string
    name: string
    runCount: number
  }>
}

const StatsCard: React.FC<{
  title: string
  value: string | number
  description?: string
  icon: React.ReactNode
  trend?: {
    value: number
    isPositive: boolean
  }
}> = ({ title, value, description, icon, trend }) => (
  <Card>
    <CardContent className="p-6">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-muted-foreground">{title}</p>
          <div className="flex items-center gap-2">
            <h3 className="text-2xl font-bold">{value}</h3>
            {trend && (
              <div className={`flex items-center gap-1 text-sm ${
                trend.isPositive ? 'text-green-600' : 'text-red-600'
              }`}>
                <TrendingUp className="h-3 w-3" />
                {trend.value}%
              </div>
            )}
          </div>
          {description && (
            <p className="text-xs text-muted-foreground mt-1">{description}</p>
          )}
        </div>
        <div className="text-muted-foreground">
          {icon}
        </div>
      </div>
    </CardContent>
  </Card>
)

export default function TagsPage() {
  const queryClient = useQueryClient()

  // Fetch tags
  const { data: tags = [], isLoading: tagsLoading, error: tagsError } = useQuery({
    queryKey: ['tags'],
    queryFn: fetchTags,
  })

  // Fetch tag statistics
  const { data: stats, isLoading: statsLoading } = useQuery({
    queryKey: ['tag-stats'],
    queryFn: fetchTagStats,
  })

  // Fetch projects for project selection
  const { data: projects = [] } = useQuery({
    queryKey: ['projects'],
    queryFn: async () => {
      const response = await api.projects.list()
      return response.map(p => ({ id: p.id, name: p.name }))
    },
  })

  // Mutations for tag operations
  const createTagMutation = useMutation({
    mutationFn: ({ name, projectId, parentId }: { name: string; projectId: string; parentId?: string }) =>
      createTag(name, projectId, parentId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tags'] })
      queryClient.invalidateQueries({ queryKey: ['tag-stats'] })
      toast.success('Tag created successfully')
    },
    onError: (error: any) => {
      toast.error(error?.message || 'Failed to create tag')
    },
  })

  const updateTagMutation = useMutation({
    mutationFn: ({ id, name }: { id: string; name: string }) =>
      updateTag(id, name),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tags'] })
      toast.success('Tag updated successfully')
    },
    onError: (error: any) => {
      toast.error(error?.message || 'Failed to update tag')
    },
  })

  const deleteTagMutation = useMutation({
    mutationFn: ({ id, preserveChildren }: { id: string; preserveChildren: boolean }) =>
      deleteTag(id, preserveChildren),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tags'] })
      queryClient.invalidateQueries({ queryKey: ['tag-stats'] })
      toast.success('Tag deleted successfully')
    },
    onError: (error: any) => {
      toast.error(error?.message || 'Failed to delete tag')
    },
  })

  const promoteTagMutation = useMutation({
    mutationFn: promoteTag,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tags'] })
      toast.success('Tag promoted to root level')
    },
    onError: (error: any) => {
      toast.error(error?.message || 'Failed to promote tag')
    },
  })

  const moveTagMutation = useMutation({
    mutationFn: ({ id, newParentId }: { id: string; newParentId?: string }) =>
      moveTag(id, newParentId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tags'] })
      toast.success('Tag moved successfully')
    },
    onError: (error: any) => {
      toast.error(error?.message || 'Failed to move tag')
    },
  })

  const handleCreateTag = async (name: string, projectId: string, parentId?: string) => {
    await createTagMutation.mutateAsync({ name, projectId, parentId })
  }

  const handleUpdateTag = async (id: string, name: string) => {
    await updateTagMutation.mutateAsync({ id, name })
  }

  const handleDeleteTag = async (id: string, preserveChildren: boolean) => {
    await deleteTagMutation.mutateAsync({ id, preserveChildren })
  }

  const handlePromoteTag = async (id: string) => {
    await promoteTagMutation.mutateAsync(id)
  }

  const handleMoveTag = async (id: string, newParentId?: string) => {
    await moveTagMutation.mutateAsync({ id, newParentId })
  }

  const isLoading = createTagMutation.isPending ||
    updateTagMutation.isPending ||
    deleteTagMutation.isPending ||
    promoteTagMutation.isPending ||
    moveTagMutation.isPending

  return (
    <Shell>
      <div className="space-y-6">
        {/* Breadcrumb */}
        <div className="flex items-center justify-between">
          <Breadcrumb>
            <BreadcrumbItem>
              <BreadcrumbLink href="/">{NAV_LABELS.dashboard}</BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>Tags</BreadcrumbItem>
          </Breadcrumb>
        </div>

        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Tag Management</h1>
            <p className="text-muted-foreground">
              Organize your training runs with hierarchical tags
            </p>
          </div>
          <Button variant="outline" asChild>
            <a href="/training-runs/by-tags">
              <BarChart3 className="h-4 w-4 mr-2" />
              View Tagged Runs
            </a>
          </Button>
        </div>

        {/* Statistics Cards */}
        {!statsLoading && stats && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <StatsCard
              title="Total Tags"
              value={stats.totalTags}
              description="All tags in hierarchy"
              icon={<Tag className="h-5 w-5" />}
            />
            <StatsCard
              title="Tagged Runs"
              value={stats.taggedRuns}
              description="Runs with tags assigned"
              icon={<BarChart3 className="h-5 w-5" />}
            />
            <StatsCard
              title="Untagged Runs"
              value={stats.untaggedRuns}
              description="Runs without tags"
              icon={<Settings className="h-5 w-5" />}
            />
            <StatsCard
              title="Coverage"
              value={`${stats.taggedRuns + stats.untaggedRuns > 0 ?
                Math.round((stats.taggedRuns / (stats.taggedRuns + stats.untaggedRuns)) * 100) : 0}%`}
              description="Percentage of tagged runs"
              icon={<TrendingUp className="h-5 w-5" />}
            />
          </div>
        )}

        {/* Main Content */}
        <Tabs defaultValue="manage" className="space-y-4">
          <TabsList>
            <TabsTrigger value="manage">Manage Tags</TabsTrigger>
            <TabsTrigger value="analytics">Analytics</TabsTrigger>
          </TabsList>

          <TabsContent value="manage" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Tag Hierarchy</CardTitle>
                <CardDescription>
                  Create, edit, and organize your tag hierarchy. Use drag-and-drop to restructure tags.
                </CardDescription>
              </CardHeader>
              <CardContent>
                {tagsError ? (
                  <div className="text-center py-8">
                    <p className="text-red-600 mb-2">Failed to load tags</p>
                    <Button
                      variant="outline"
                      onClick={() => queryClient.invalidateQueries({ queryKey: ['tags'] })}
                    >
                      Retry
                    </Button>
                  </div>
                ) : (
                  <TagTreeManager
                    tags={tags}
                    projects={projects}
                    onCreateTag={handleCreateTag}
                    onUpdateTag={handleUpdateTag}
                    onDeleteTag={handleDeleteTag}
                    onPromoteTag={handlePromoteTag}
                    onMoveTag={handleMoveTag}
                    isLoading={tagsLoading || isLoading}
                  />
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="analytics" className="space-y-4">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Most Used Tags */}
              <Card>
                <CardHeader>
                  <CardTitle>Most Used Tags</CardTitle>
                  <CardDescription>
                    Tags with the highest number of associated runs
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {stats?.mostUsedTags.length ? (
                    <div className="space-y-3">
                      {stats.mostUsedTags.map((tag, index) => (
                        <div key={tag.id} className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <div className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center text-xs font-medium">
                              {index + 1}
                            </div>
                            <span className="font-medium">{tag.name}</span>
                          </div>
                          <Badge variant="secondary">
                            {tag.runCount} runs
                          </Badge>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-8 text-muted-foreground">
                      No tag usage data available
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Tag Distribution */}
              <Card>
                <CardHeader>
                  <CardTitle>Tag Distribution</CardTitle>
                  <CardDescription>
                    Overview of tag hierarchy structure
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <div className="text-center py-8 text-muted-foreground">
                      Tag distribution chart would go here
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </Shell>
  )
}