"use client"

import React, { useState, useCallback } from "react"
import { ChevronRight, ChevronDown, MoreHorizontal, Plus, Edit, Trash2, MoveUp, ArrowRight } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog"
import { Dialog, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Separator } from "@/components/ui/separator"

// Types for the tag tree
export interface TagNode {
  id: string
  project_id: string
  name: string
  parent_id?: string | null
  path: string
  level: number
  children: TagNode[]
  runCount?: number
  totalRunCount?: number
  created_at: string
  updated_at: string
}

interface TagTreeManagerProps {
  tags: TagNode[]
  projectId?: string
  onCreateTag: (name: string, parentId?: string) => Promise<void>
  onUpdateTag: (id: string, name: string) => Promise<void>
  onDeleteTag: (id: string, preserveChildren: boolean) => Promise<void>
  onPromoteTag: (id: string) => Promise<void>
  onMoveTag: (id: string, newParentId?: string) => Promise<void>
  isLoading?: boolean
}

interface TagDialogState {
  type: 'create' | 'edit' | 'move' | null
  tagId?: string
  parentId?: string
  currentName?: string
}

interface DeleteDialogState {
  isOpen: boolean
  tagId?: string
  tagName?: string
  hasChildren?: boolean
}

const TagTreeItem: React.FC<{
  tag: TagNode
  level: number
  allTags: TagNode[]
  onSelect?: (tag: TagNode) => void
  onAction: (action: string, tagId: string, data?: any) => void
}> = ({ tag, level, allTags, onSelect, onAction }) => {
  const [isExpanded, setIsExpanded] = useState(true)
  const hasChildren = tag.children && tag.children.length > 0

  const handleToggle = () => {
    if (hasChildren) {
      setIsExpanded(!isExpanded)
    }
  }

  const handleAction = (action: string, data?: any) => {
    onAction(action, tag.id, data)
  }

  return (
    <div className="select-none">
      <div
        className="flex items-center gap-2 py-1 px-2 hover:bg-accent rounded-sm group"
        style={{ paddingLeft: `${level * 20 + 8}px` }}
      >
        <Button
          variant="ghost"
          size="sm"
          className="h-4 w-4 p-0"
          onClick={handleToggle}
          disabled={!hasChildren}
        >
          {hasChildren ? (
            isExpanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />
          ) : (
            <div className="h-3 w-3" />
          )}
        </Button>

        <div
          className="flex-1 flex items-center gap-2 cursor-pointer"
          onClick={() => onSelect?.(tag)}
        >
          <span className="text-sm font-medium">{tag.name}</span>
          {(tag.runCount || 0) > 0 && (
            <Badge variant="secondary" className="text-xs">
              {tag.runCount} runs
            </Badge>
          )}
          {(tag.totalRunCount || 0) > (tag.runCount || 0) && (
            <Badge variant="outline" className="text-xs">
              +{(tag.totalRunCount || 0) - (tag.runCount || 0)} nested
            </Badge>
          )}
        </div>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="sm" className="h-6 w-6 p-0 opacity-0 group-hover:opacity-100">
              <MoreHorizontal className="h-3 w-3" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            <DropdownMenuItem onClick={() => handleAction('create', { parentId: tag.id })}>
              <Plus className="mr-2 h-4 w-4" />
              Add Child Tag
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => handleAction('edit')}>
              <Edit className="mr-2 h-4 w-4" />
              Rename
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => handleAction('move')}>
              <ArrowRight className="mr-2 h-4 w-4" />
              Move
            </DropdownMenuItem>
            {tag.parent_id && (
              <DropdownMenuItem onClick={() => handleAction('promote')}>
                <MoveUp className="mr-2 h-4 w-4" />
                Promote to Root
              </DropdownMenuItem>
            )}
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={() => handleAction('delete')}
              className="text-destructive focus:text-destructive"
            >
              <Trash2 className="mr-2 h-4 w-4" />
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {hasChildren && isExpanded && (
        <div>
          {tag.children.map((child) => (
            <TagTreeItem
              key={child.id}
              tag={child}
              level={level + 1}
              allTags={allTags}
              onSelect={onSelect}
              onAction={onAction}
            />
          ))}
        </div>
      )}
    </div>
  )
}

export const TagTreeManager: React.FC<TagTreeManagerProps> = ({
  tags,
  onCreateTag,
  onUpdateTag,
  onDeleteTag,
  onPromoteTag,
  onMoveTag,
  isLoading = false
}) => {
  const [dialogState, setDialogState] = useState<TagDialogState>({ type: null })
  const [deleteState, setDeleteState] = useState<DeleteDialogState>({ isOpen: false })
  const [formData, setFormData] = useState({ name: '', parentId: '' })

  const flattenTags = useCallback((tags: TagNode[]): TagNode[] => {
    const result: TagNode[] = []
    const traverse = (nodes: TagNode[]) => {
      nodes.forEach(node => {
        result.push(node)
        if (node.children) traverse(node.children)
      })
    }
    traverse(tags)
    return result
  }, [])

  const handleAction = useCallback((action: string, tagId: string, data?: any) => {
    const tag = flattenTags(tags).find(t => t.id === tagId)
    if (!tag) return

    switch (action) {
      case 'create':
        setFormData({ name: '', parentId: data?.parentId || tagId })
        setDialogState({ type: 'create', parentId: data?.parentId || tagId })
        break
      case 'edit':
        setFormData({ name: tag.name, parentId: '' })
        setDialogState({ type: 'edit', tagId, currentName: tag.name })
        break
      case 'move':
        setFormData({ name: '', parentId: tag.parent_id || '' })
        setDialogState({ type: 'move', tagId })
        break
      case 'promote':
        onPromoteTag(tagId)
        break
      case 'delete':
        setDeleteState({
          isOpen: true,
          tagId,
          tagName: tag.name,
          hasChildren: tag.children && tag.children.length > 0
        })
        break
    }
  }, [tags, onPromoteTag])

  const handleDialogSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    try {
      switch (dialogState.type) {
        case 'create':
          await onCreateTag(formData.name, formData.parentId || undefined)
          break
        case 'edit':
          if (dialogState.tagId) {
            await onUpdateTag(dialogState.tagId, formData.name)
          }
          break
        case 'move':
          if (dialogState.tagId) {
            await onMoveTag(dialogState.tagId, formData.parentId || undefined)
          }
          break
      }
      setDialogState({ type: null })
      setFormData({ name: '', parentId: '' })
    } catch (error) {
      console.error('Tag operation failed:', error)
    }
  }

  const handleDelete = async (preserveChildren: boolean) => {
    if (deleteState.tagId) {
      try {
        await onDeleteTag(deleteState.tagId, preserveChildren)
        setDeleteState({ isOpen: false })
      } catch (error) {
        console.error('Delete failed:', error)
      }
    }
  }

  const allFlatTags = flattenTags(tags)

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">Tag Management</h3>
        <Button
          onClick={() => {
            setFormData({ name: '', parentId: '' })
            setDialogState({ type: 'create' })
          }}
          size="sm"
          disabled={isLoading}
        >
          <Plus className="mr-2 h-4 w-4" />
          New Tag
        </Button>
      </div>

      <ScrollArea className="h-96 border rounded-md p-2">
        {tags.length > 0 ? (
          <div className="space-y-1">
            {tags.map((tag) => (
              <TagTreeItem
                key={tag.id}
                tag={tag}
                level={0}
                allTags={allFlatTags}
                onAction={handleAction}
              />
            ))}
          </div>
        ) : (
          <div className="text-center py-8 text-muted-foreground">
            No tags created yet. Click "New Tag" to get started.
          </div>
        )}
      </ScrollArea>

      {/* Create/Edit/Move Dialog */}
      <Dialog
        open={dialogState.type !== null}
        onOpenChange={(open) => !open && setDialogState({ type: null })}
      >
        <DialogContent>
          <DialogTitle>
            {dialogState.type === 'create' && 'Create New Tag'}
            {dialogState.type === 'edit' && 'Edit Tag'}
            {dialogState.type === 'move' && 'Move Tag'}
          </DialogTitle>
          <DialogDescription>
            {dialogState.type === 'create' && 'Create a new tag in the hierarchy.'}
            {dialogState.type === 'edit' && 'Change the tag name.'}
            {dialogState.type === 'move' && 'Move this tag to a new parent.'}
          </DialogDescription>

          <form onSubmit={handleDialogSubmit} className="space-y-4">
            {dialogState.type !== 'move' && (
              <div>
                <Label htmlFor="tagName">Tag Name</Label>
                <Input
                  id="tagName"
                  value={formData.name}
                  onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                  placeholder="Enter tag name"
                  required
                />
              </div>
            )}

            {(dialogState.type === 'create' || dialogState.type === 'move') && (
              <div>
                <Label htmlFor="parentTag">Parent Tag (optional)</Label>
                <select
                  id="parentTag"
                  value={formData.parentId}
                  onChange={(e) => setFormData(prev => ({ ...prev, parentId: e.target.value }))}
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <option value="">Root Level</option>
                  {allFlatTags
                    .filter(tag => dialogState.type === 'move' ? tag.id !== dialogState.tagId : true)
                    .map((tag) => (
                      <option key={tag.id} value={tag.id}>
                        {'  '.repeat(tag.level)}{tag.name}
                      </option>
                    ))}
                </select>
              </div>
            )}

            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setDialogState({ type: null })}>
                Cancel
              </Button>
              <Button type="submit" disabled={isLoading}>
                {dialogState.type === 'create' && 'Create'}
                {dialogState.type === 'edit' && 'Save'}
                {dialogState.type === 'move' && 'Move'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteState.isOpen} onOpenChange={(open) => setDeleteState(prev => ({ ...prev, isOpen: open }))}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Tag "{deleteState.tagName}"?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. This will permanently delete the tag.
              {deleteState.hasChildren && (
                <div className="mt-2 text-sm">
                  <strong>This tag has children.</strong> You can either:
                  <ul className="mt-1 ml-4 list-disc">
                    <li>Delete the tag and all its children (destructive)</li>
                    <li>Delete only this tag and promote children to the parent level</li>
                  </ul>
                </div>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            {deleteState.hasChildren ? (
              <>
                <AlertDialogAction
                  onClick={() => handleDelete(true)}
                  className="bg-orange-600 hover:bg-orange-700"
                >
                  Promote Children
                </AlertDialogAction>
                <AlertDialogAction
                  onClick={() => handleDelete(false)}
                  className="bg-destructive hover:bg-destructive/90"
                >
                  Delete All
                </AlertDialogAction>
              </>
            ) : (
              <AlertDialogAction onClick={() => handleDelete(false)}>
                Delete
              </AlertDialogAction>
            )}
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}