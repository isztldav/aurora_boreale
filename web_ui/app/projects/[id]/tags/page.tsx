"use client"

import React, { useState, useMemo, useCallback } from "react"
import { useParams } from "next/navigation"
import { useQuery } from "@tanstack/react-query"
import { ChevronDown, ChevronRight, Filter, Search, Tag, Play, Square, CheckCircle, XCircle, Clock, BarChart3, Circle } from "lucide-react"
import { Shell } from "@/components/shell/shell"
import { Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbSeparator } from "@/components/ui/breadcrumb"
import { ProjectNav } from "@/components/projects/project-nav"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Separator } from "@/components/ui/separator"
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table"
import { DropdownMenu, DropdownMenuContent, DropdownMenuCheckboxItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { formatDateTime, shortId } from "@/lib/utils"
import { NAV_LABELS } from "@/lib/app-config"
import { RunStateBadge } from "@/components/projects/run-state-badge"
import { api, apiEx } from "@/lib/api"

// API functions using the real API client
const fetchTags = async (projectId: string): Promise<TagWithStats[]> => {
  const tags = await apiEx.tags.getProjectTagTree(projectId)

  const mapTagToStats = (tag: any): TagWithStats => ({
    ...tag,
    direct_runs: 0, // Would be fetched from backend
    total_runs: 0,
    children: tag.children ? tag.children.map(mapTagToStats) : []
  })

  return tags.map(mapTagToStats)
}

const fetchRunsByTag = async (tagId: string, includeDescendants: boolean = true): Promise<RunWithTags[]> => {
  const runs = await apiEx.tags.getRunsByTag(tagId, includeDescendants)
  return runs.map((run): RunWithTags => ({
    ...run,
    tags: [], // Would be populated by backend
  }))
}

const fetchProjectRuns = async (projectId: string): Promise<RunWithTags[]> => {
  const runs = await api.runs.list({ project_id: projectId }) || []
  return runs.map((run): RunWithTags => ({
    ...run,
    tags: [], // Would be populated by backend
  }))
}

interface TagWithStats {
  id: string
  name: string
  path: string
  level: number
  parent_id?: string | null
  children: TagWithStats[]
  direct_runs: number
  total_runs: number
  created_at: string
  updated_at: string
}

interface RunWithTags {
  id: string
  name: string
  state: string
  best_value?: number | null
  epoch?: number | null
  started_at?: string | null
  finished_at?: string | null
  project_id: string
  config_id: string
  monitor_metric?: string | null
  monitor_mode?: string | null
  tags: Array<{
    id: string
    name: string
    path: string
  }>
}

const getStateIcon = (state: string) => {
  switch (state) {
    case 'running': return <Play className="h-4 w-4 text-blue-500" />
    case 'queued': return <Clock className="h-4 w-4 text-yellow-500" />
    case 'succeeded': return <CheckCircle className="h-4 w-4 text-green-500" />
    case 'failed': return <XCircle className="h-4 w-4 text-red-500" />
    case 'canceled': return <Square className="h-4 w-4 text-gray-500" />
    default: return <Circle className="h-4 w-4 text-gray-400" />
  }
}

const TagHierarchyCard: React.FC<{
  tag: TagWithStats
  level: number
  onSelectTag: (tagId: string) => void
  selectedTagId?: string
  searchQuery: string
}> = ({ tag, level, onSelectTag, selectedTagId, searchQuery }) => {
  const [isExpanded, setIsExpanded] = useState(level < 2) // Auto-expand first 2 levels
  const hasChildren = tag.children && tag.children.length > 0

  const isHighlighted = searchQuery && tag.name.toLowerCase().includes(searchQuery.toLowerCase())
  const isSelected = selectedTagId === tag.id

  const handleToggle = () => {
    if (hasChildren) {
      setIsExpanded(!isExpanded)
    }
  }

  return (
    <div className="space-y-1">
      <div
        className={`flex items-center gap-2 p-2 rounded-lg cursor-pointer transition-colors ${
          isSelected ? 'bg-primary/10 border border-primary/20' :
          isHighlighted ? 'bg-yellow-50 border border-yellow-200' :
          'hover:bg-accent'
        }`}
        style={{ paddingLeft: `${level * 16 + 8}px` }}
        onClick={() => onSelectTag(tag.id)}
      >
        <Button
          variant="ghost"
          size="sm"
          className="h-4 w-4 p-0"
          onClick={(e) => {
            e.stopPropagation()
            handleToggle()
          }}
          disabled={!hasChildren}
        >
          {hasChildren ? (
            isExpanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />
          ) : (
            <div className="h-3 w-3" />
          )}
        </Button>

        <Tag className="h-4 w-4 text-muted-foreground" />

        <div className="flex-1 flex items-center justify-between">
          <span className={`font-medium ${isSelected ? 'text-primary' : ''}`}>
            {tag.name}
          </span>

          <div className="flex items-center gap-2">
            {tag.direct_runs > 0 && (
              <Badge variant="secondary" className="text-xs">
                {tag.direct_runs}
              </Badge>
            )}
            {tag.total_runs > tag.direct_runs && (
              <Badge variant="outline" className="text-xs">
                +{tag.total_runs - tag.direct_runs}
              </Badge>
            )}
          </div>
        </div>
      </div>

      {hasChildren && isExpanded && (
        <div className="space-y-1">
          {tag.children.map((child) => (
            <TagHierarchyCard
              key={child.id}
              tag={child}
              level={level + 1}
              onSelectTag={onSelectTag}
              selectedTagId={selectedTagId}
              searchQuery={searchQuery}
            />
          ))}
        </div>
      )}
    </div>
  )
}

const RunsTable: React.FC<{
  runs: RunWithTags[]
  onSelectRun: (run: RunWithTags) => void
}> = ({ runs, onSelectRun }) => {
  if (runs.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        No training runs found for the selected tag.
      </div>
    )
  }

  return (
    <Table>
      <THead>
        <TR>
          <TH>Run Name</TH>
          <TH>State</TH>
          <TH>Best Value</TH>
          <TH>Epoch</TH>
          <TH>Started</TH>
          <TH>Duration</TH>
          <TH>Tags</TH>
        </TR>
      </THead>
      <TBody>
        {runs.map((run: RunWithTags) => (
          <TR
            key={run.id}
            className="cursor-pointer hover:bg-accent"
            onClick={() => onSelectRun(run)}
          >
            <TD>
              <div className="flex items-center gap-2">
                {getStateIcon(run.state)}
                <span className="font-medium">{run.name}</span>
                <span className="text-xs text-muted-foreground">
                  {shortId(run.id)}
                </span>
              </div>
            </TD>
            <TD>
              <RunStateBadge state={run.state} />
            </TD>
            <TD>
              {run.best_value !== undefined && run.best_value !== null ? (
                <span className="font-mono text-sm">
                  {run.best_value.toFixed(4)}
                </span>
              ) : (
                <span className="text-muted-foreground">-</span>
              )}
            </TD>
            <TD>
              {run.epoch !== undefined && run.epoch !== null ? (
                <span className="font-mono text-sm">{run.epoch}</span>
              ) : (
                <span className="text-muted-foreground">-</span>
              )}
            </TD>
            <TD>
              {run.started_at ? (
                <span className="text-sm">{formatDateTime(run.started_at)}</span>
              ) : (
                <span className="text-muted-foreground">-</span>
              )}
            </TD>
            <TD>
              {run.started_at && run.finished_at ? (
                <span className="text-sm">
                  {Math.round(
                    (new Date(run.finished_at).getTime() - new Date(run.started_at).getTime()) / 1000 / 60
                  )}m
                </span>
              ) : run.started_at ? (
                <span className="text-sm text-blue-600">Running</span>
              ) : (
                <span className="text-muted-foreground">-</span>
              )}
            </TD>
            <TD>
              <div className="flex flex-wrap gap-1">
                {run.tags.slice(0, 3).map((tag) => (
                  <Badge key={tag.id} variant="outline" className="text-xs">
                    {tag.name}
                  </Badge>
                ))}
                {run.tags.length > 3 && (
                  <Badge variant="outline" className="text-xs">
                    +{run.tags.length - 3}
                  </Badge>
                )}
              </div>
            </TD>
          </TR>
        ))}
      </TBody>
    </Table>
  )
}

export default function ProjectTagsPage() {
  const params = useParams<{ id: string }>()
  const projectId = params.id

  const [selectedTagId, setSelectedTagId] = useState<string>()
  const [searchQuery, setSearchQuery] = useState("")
  const [includeDescendants, setIncludeDescendants] = useState(true)
  const [stateFilters, setStateFilters] = useState<Record<string, boolean>>({
    running: true,
    queued: true,
    succeeded: true,
    failed: true,
    canceled: true
  })

  // Fetch tags with stats
  const { data: tags = [], isLoading: tagsLoading } = useQuery({
    queryKey: ['tags-with-stats', projectId],
    queryFn: () => fetchTags(projectId),
  })

  // Fetch runs for selected tag or all project runs
  const { data: runs = [], isLoading: runsLoading } = useQuery({
    queryKey: ['project-runs-by-tag', projectId, selectedTagId, includeDescendants],
    queryFn: () => {
      if (selectedTagId) {
        return fetchRunsByTag(selectedTagId, includeDescendants)
      } else {
        return fetchProjectRuns(projectId)
      }
    },
  })

  const selectedTag = useMemo(() => {
    const findTag = (tags: TagWithStats[]): TagWithStats | undefined => {
      for (const tag of tags) {
        if (tag.id === selectedTagId) return tag
        const found = findTag(tag.children)
        if (found) return found
      }
    }
    return findTag(tags)
  }, [tags, selectedTagId])

  const filteredRuns = useMemo(() => {
    return runs.filter((run: RunWithTags) => stateFilters[run.state] !== false)
  }, [runs, stateFilters])

  const handleSelectTag = useCallback((tagId: string) => {
    setSelectedTagId(tagId === selectedTagId ? undefined : tagId)
  }, [selectedTagId])

  const handleStateFilterChange = useCallback((state: string, checked: boolean) => {
    setStateFilters(prev => ({ ...prev, [state]: checked }))
  }, [])

  return (
    <Shell>
      <div className="space-y-6">
        {/* Breadcrumb */}
        <Breadcrumb>
          <BreadcrumbItem>
            <BreadcrumbLink href="/">{NAV_LABELS.dashboard}</BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbLink href={`/projects/${projectId}`}>Project {shortId(projectId)}</BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>Tags</BreadcrumbItem>
        </Breadcrumb>

        {/* Project Title & Navigation */}
        <div>
          <h1 className="text-2xl font-semibold mb-4">Project {shortId(projectId)}</h1>
          <ProjectNav projectId={projectId} current="tags" />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          {/* Left Sidebar - Tag Hierarchy */}
          <div className="lg:col-span-1">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Tag className="h-5 w-5" />
                  Tag Hierarchy
                </CardTitle>
                <CardDescription>
                  Select a tag to view associated training runs
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Search */}
                <div className="relative">
                  <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search tags..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-8"
                  />
                </div>

                {/* Clear Selection Button */}
                {selectedTagId && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setSelectedTagId(undefined)}
                    className="w-full"
                  >
                    Show All Runs
                  </Button>
                )}

                {/* Tag Tree */}
                <ScrollArea className="h-96">
                  {tagsLoading ? (
                    <div className="text-center py-4 text-muted-foreground">
                      Loading tags...
                    </div>
                  ) : tags.length > 0 ? (
                    <div className="space-y-1">
                      {tags.map((tag: TagWithStats) => (
                        <TagHierarchyCard
                          key={tag.id}
                          tag={tag}
                          level={0}
                          onSelectTag={handleSelectTag}
                          selectedTagId={selectedTagId}
                          searchQuery={searchQuery}
                        />
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-8 text-muted-foreground">
                      No tags found. Create tags to organize your training runs.
                    </div>
                  )}
                </ScrollArea>
              </CardContent>
            </Card>
          </div>

          {/* Main Content - Runs List */}
          <div className="lg:col-span-3">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="flex items-center gap-2">
                      <BarChart3 className="h-5 w-5" />
                      Training Runs
                      {selectedTag ? (
                        <>
                          <span className="text-muted-foreground">for</span>
                          <Badge variant="outline">{selectedTag.name}</Badge>
                        </>
                      ) : (
                        <span className="text-muted-foreground">- All Runs</span>
                      )}
                    </CardTitle>
                    <CardDescription>
                      {selectedTag ? (
                        `Showing ${filteredRuns.length} runs for tag "${selectedTag.name}"`
                      ) : (
                        `Showing ${filteredRuns.length} runs from this project`
                      )}
                    </CardDescription>
                  </div>

                  <div className="flex items-center gap-2">
                    {/* Include Descendants Toggle */}
                    {selectedTag && (
                      <div className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          id="includeDescendants"
                          checked={includeDescendants}
                          onChange={(e) => setIncludeDescendants(e.target.checked)}
                          className="rounded"
                        />
                        <label htmlFor="includeDescendants" className="text-sm">
                          Include child tags
                        </label>
                      </div>
                    )}

                    {/* State Filter */}
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="outline" size="sm">
                          <Filter className="h-4 w-4 mr-2" />
                          Filter
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent>
                        {Object.entries(stateFilters).map(([state, checked]) => (
                          <DropdownMenuCheckboxItem
                            key={state}
                            checked={checked}
                            onCheckedChange={(checked: boolean) => handleStateFilterChange(state, checked)}
                          >
                            <RunStateBadge state={state} />
                          </DropdownMenuCheckboxItem>
                        ))}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                {runsLoading ? (
                  <div className="text-center py-8 text-muted-foreground">
                    Loading runs...
                  </div>
                ) : (
                  <RunsTable
                    runs={filteredRuns}
                    onSelectRun={(run) => {
                      // Handle run selection - could open run details modal
                      console.log('Selected run:', run)
                    }}
                  />
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </Shell>
  )
}