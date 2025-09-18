"use client"

import React, { useState, useCallback, useEffect } from "react"
import { Check, ChevronsUpDown, X, Tag } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Separator } from "@/components/ui/separator"

export interface TagOption {
  id: string
  name: string
  path: string
  level: number
  parent_id?: string | null
}

interface TagSelectorProps {
  tags: TagOption[]
  selectedTagIds: string[]
  onSelectionChange: (tagIds: string[]) => void
  placeholder?: string
  disabled?: boolean
  maxTags?: number
  className?: string
}

const TagBreadcrumb: React.FC<{ tag: TagOption; tags: TagOption[] }> = ({ tag, tags }) => {
  const getAncestors = useCallback((currentTag: TagOption): TagOption[] => {
    const ancestors: TagOption[] = []
    let current = currentTag

    while (current.parent_id) {
      const parent = tags.find(t => t.id === current.parent_id)
      if (parent) {
        ancestors.unshift(parent)
        current = parent
      } else {
        break
      }
    }

    return ancestors
  }, [tags])

  const ancestors = getAncestors(tag)

  if (ancestors.length === 0) {
    return <span className="font-medium">{tag.name}</span>
  }

  return (
    <span className="flex items-center gap-1">
      {ancestors.map((ancestor, index) => (
        <React.Fragment key={ancestor.id}>
          <span className="text-muted-foreground text-xs">{ancestor.name}</span>
          <span className="text-muted-foreground text-xs">/</span>
        </React.Fragment>
      ))}
      <span className="font-medium">{tag.name}</span>
    </span>
  )
}

export const TagSelector: React.FC<TagSelectorProps> = ({
  tags,
  selectedTagIds,
  onSelectionChange,
  placeholder = "Select tags...",
  disabled = false,
  maxTags = 10,
  className = ""
}) => {
  const [open, setOpen] = useState(false)
  const [searchValue, setSearchValue] = useState("")

  const selectedTags = tags.filter(tag => selectedTagIds.includes(tag.id))

  const handleSelect = useCallback((tagId: string) => {
    const isSelected = selectedTagIds.includes(tagId)

    if (isSelected) {
      // Remove tag
      onSelectionChange(selectedTagIds.filter(id => id !== tagId))
    } else {
      // Add tag (respect max limit)
      if (selectedTagIds.length < maxTags) {
        onSelectionChange([...selectedTagIds, tagId])
      }
    }
  }, [selectedTagIds, onSelectionChange, maxTags])

  const handleRemove = useCallback((tagId: string) => {
    onSelectionChange(selectedTagIds.filter(id => id !== tagId))
  }, [selectedTagIds, onSelectionChange])

  const handleClearAll = useCallback(() => {
    onSelectionChange([])
  }, [onSelectionChange])

  // Filter tags based on search
  const filteredTags = tags.filter(tag =>
    tag.name.toLowerCase().includes(searchValue.toLowerCase()) ||
    tag.path.toLowerCase().includes(searchValue.toLowerCase())
  )

  // Group tags by level for better organization
  const groupedTags = filteredTags.reduce((acc, tag) => {
    const level = tag.level
    if (!acc[level]) {
      acc[level] = []
    }
    acc[level].push(tag)
    return acc
  }, {} as Record<number, TagOption[]>)

  const sortedLevels = Object.keys(groupedTags).map(Number).sort((a, b) => a - b)

  return (
    <div className={`space-y-2 ${className}`}>
      {/* Selected Tags Display */}
      {selectedTags.length > 0 && (
        <div className="flex flex-wrap gap-1 p-2 border rounded-md min-h-[40px] bg-background">
          {selectedTags.map((tag) => (
            <Badge key={tag.id} variant="secondary" className="flex items-center gap-1 pr-1">
              <TagBreadcrumb tag={tag} tags={tags} />
              <Button
                variant="ghost"
                size="sm"
                className="h-4 w-4 p-0 hover:bg-destructive hover:text-destructive-foreground"
                onClick={() => handleRemove(tag.id)}
                disabled={disabled}
              >
                <X className="h-3 w-3" />
              </Button>
            </Badge>
          ))}
          {selectedTags.length > 1 && (
            <Button
              variant="ghost"
              size="sm"
              className="h-6 text-xs text-muted-foreground hover:text-foreground"
              onClick={handleClearAll}
              disabled={disabled}
            >
              Clear all
            </Button>
          )}
        </div>
      )}

      {/* Tag Selector */}
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            role="combobox"
            aria-expanded={open}
            className={`w-full justify-between ${selectedTags.length > 0 ? 'h-10' : 'h-10'}`}
            disabled={disabled}
          >
            <div className="flex items-center gap-2">
              <Tag className="h-4 w-4" />
              {selectedTags.length === 0 ? (
                <span className="text-muted-foreground">{placeholder}</span>
              ) : (
                <span>{selectedTags.length} tag{selectedTags.length > 1 ? 's' : ''} selected</span>
              )}
            </div>
            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>

        <PopoverContent className="w-full p-0" align="start">
          <Command>
            <CommandInput
              placeholder="Search tags..."
              value={searchValue}
              onValueChange={setSearchValue}
            />
            <CommandList>
              <CommandEmpty>No tags found.</CommandEmpty>

              <ScrollArea className="h-64">
                {sortedLevels.map((level) => (
                  <CommandGroup key={level} heading={level === 0 ? "Root Tags" : `Level ${level}`}>
                    {groupedTags[level].map((tag) => {
                      const isSelected = selectedTagIds.includes(tag.id)
                      const isMaxReached = selectedTagIds.length >= maxTags && !isSelected

                      return (
                        <CommandItem
                          key={tag.id}
                          value={tag.id}
                          onSelect={() => handleSelect(tag.id)}
                          disabled={isMaxReached}
                          className="flex items-center justify-between"
                        >
                          <div className="flex items-center gap-2 flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <Check
                                className={`h-4 w-4 ${isSelected ? "opacity-100" : "opacity-0"}`}
                              />
                              <div className="flex-1 min-w-0">
                                <TagBreadcrumb tag={tag} tags={tags} />
                              </div>
                            </div>
                          </div>

                          {isMaxReached && (
                            <span className="text-xs text-muted-foreground ml-2">Max reached</span>
                          )}
                        </CommandItem>
                      )
                    })}
                  </CommandGroup>
                ))}

                {selectedTagIds.length >= maxTags && (
                  <>
                    <Separator />
                    <div className="p-2 text-center text-xs text-muted-foreground">
                      Maximum {maxTags} tags selected
                    </div>
                  </>
                )}
              </ScrollArea>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>

      {/* Helper text */}
      {maxTags && (
        <div className="text-xs text-muted-foreground">
          {selectedTagIds.length}/{maxTags} tags selected
        </div>
      )}
    </div>
  )
}

// Simplified version for single selection
export const SingleTagSelector: React.FC<{
  tags: TagOption[]
  selectedTagId?: string
  onSelectionChange: (tagId?: string) => void
  placeholder?: string
  disabled?: boolean
  allowClear?: boolean
  className?: string
}> = ({
  tags,
  selectedTagId,
  onSelectionChange,
  placeholder = "Select a tag...",
  disabled = false,
  allowClear = true,
  className = ""
}) => {
  const [open, setOpen] = useState(false)
  const [searchValue, setSearchValue] = useState("")

  const selectedTag = tags.find(tag => tag.id === selectedTagId)

  const handleSelect = useCallback((tagId: string) => {
    if (selectedTagId === tagId && allowClear) {
      onSelectionChange(undefined)
    } else {
      onSelectionChange(tagId)
    }
    setOpen(false)
  }, [selectedTagId, onSelectionChange, allowClear])

  const filteredTags = tags.filter(tag =>
    tag.name.toLowerCase().includes(searchValue.toLowerCase()) ||
    tag.path.toLowerCase().includes(searchValue.toLowerCase())
  )

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className={`w-full justify-between ${className}`}
          disabled={disabled}
        >
          <div className="flex items-center gap-2">
            <Tag className="h-4 w-4" />
            {selectedTag ? (
              <TagBreadcrumb tag={selectedTag} tags={tags} />
            ) : (
              <span className="text-muted-foreground">{placeholder}</span>
            )}
          </div>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>

      <PopoverContent className="w-full p-0" align="start">
        <Command>
          <CommandInput
            placeholder="Search tags..."
            value={searchValue}
            onValueChange={setSearchValue}
          />
          <CommandList>
            <CommandEmpty>No tags found.</CommandEmpty>

            <ScrollArea className="h-64">
              {allowClear && selectedTag && (
                <>
                  <CommandGroup>
                    <CommandItem
                      onSelect={() => onSelectionChange(undefined)}
                      className="text-muted-foreground"
                    >
                      <X className="mr-2 h-4 w-4" />
                      Clear selection
                    </CommandItem>
                  </CommandGroup>
                  <Separator />
                </>
              )}

              <CommandGroup>
                {filteredTags.map((tag) => (
                  <CommandItem
                    key={tag.id}
                    value={tag.id}
                    onSelect={() => handleSelect(tag.id)}
                    className="flex items-center gap-2"
                  >
                    <Check
                      className={`h-4 w-4 ${selectedTagId === tag.id ? "opacity-100" : "opacity-0"}`}
                    />
                    <TagBreadcrumb tag={tag} tags={tags} />
                  </CommandItem>
                ))}
              </CommandGroup>
            </ScrollArea>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}