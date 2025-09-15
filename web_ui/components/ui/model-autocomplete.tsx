"use client"

import { useState, useEffect, useRef } from 'react'
import { Check, ChevronDown, Search } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Command, CommandEmpty, CommandGroup, CommandItem, CommandList } from '@/components/ui/command'
import { getImageModels, HuggingFaceModel, SUPPORTED_TASKS } from '@/lib/huggingface'
import { Badge } from '@/components/ui/badge'

interface ModelAutocompleteProps {
  value: string
  onValueChange: (value: string) => void
  placeholder?: string
  className?: string
  disabled?: boolean
}

export function ModelAutocomplete({
  value,
  onValueChange,
  placeholder = "Search for a model...",
  className,
  disabled = false
}: ModelAutocompleteProps) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [models, setModels] = useState<HuggingFaceModel[]>([])
  const [loading, setLoading] = useState(false)
  const debounceRef = useRef<NodeJS.Timeout>()

  // Debounced search function
  useEffect(() => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current)
    }

    debounceRef.current = setTimeout(async () => {
      if (search.length > 0) {
        setLoading(true)
        try {
          const results = await getImageModels(search)
          setModels(results)
        } catch (error) {
          console.error('Failed to search models:', error)
          setModels([])
        } finally {
          setLoading(false)
        }
      } else {
        setModels([])
      }
    }, 300)

    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current)
      }
    }
  }, [search])

  const selectedModel = models.find(model => model.id === value)

  return (
    <div className="space-y-2">
      {/* Supported model types indicator */}
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <span>Supported types:</span>
        {SUPPORTED_TASKS.map(task => (
          <Badge key={task} variant="outline" className="text-xs">
            {task.replace('-', ' ')}
          </Badge>
        ))}
      </div>

      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            role="combobox"
            aria-expanded={open}
            className={cn("w-full justify-between", className)}
            disabled={disabled}
          >
            <div className="flex items-center gap-2 flex-1 min-w-0">
              <Search className="h-4 w-4 text-muted-foreground flex-shrink-0" />
              <span className="truncate">
                {selectedModel ? selectedModel.id : placeholder}
              </span>
            </div>
            <ChevronDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-full min-w-[400px] p-0" align="start">
          <Command shouldFilter={false}>
            <div className="flex items-center border-b px-3">
              <Search className="mr-2 h-4 w-4 shrink-0 opacity-50" />
              <Input
                placeholder="Type to search HuggingFace models..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="flex h-11 w-full border-0 bg-transparent py-3 text-sm outline-none placeholder:text-muted-foreground focus:ring-0"
              />
            </div>
            <CommandList>
              {loading ? (
                <div className="py-6 text-center text-sm text-muted-foreground">
                  Searching models...
                </div>
              ) : models.length === 0 && search.length > 0 ? (
                <CommandGroup>
                  <CommandItem
                    value={search}
                    onSelect={(currentValue) => {
                      onValueChange(currentValue)
                      setOpen(false)
                      setSearch('')
                    }}
                    className="flex items-center justify-between cursor-pointer"
                  >
                    <div className="flex flex-col gap-1 flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-medium truncate">"{search}"</span>
                        <Badge variant="outline" className="text-xs">
                          manual entry
                        </Badge>
                      </div>
                      <span className="text-xs text-muted-foreground">
                        Use this model ID directly
                      </span>
                    </div>
                    <Check
                      className={cn(
                        "ml-2 h-4 w-4 flex-shrink-0",
                        value === search ? "opacity-100" : "opacity-0"
                      )}
                    />
                  </CommandItem>
                </CommandGroup>
              ) : search.length === 0 ? (
                <div className="py-6 text-center text-sm text-muted-foreground">
                  Start typing to search for models
                </div>
              ) : (
                <CommandGroup>
                  {models.map((model) => (
                    <CommandItem
                      key={model.id}
                      value={model.id}
                      onSelect={(currentValue) => {
                        onValueChange(currentValue)
                        setOpen(false)
                        setSearch('')
                      }}
                      className="flex items-center justify-between cursor-pointer"
                    >
                      <div className="flex flex-col gap-1 flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-medium truncate">{model.id}</span>
                          {model.pipeline_tag && (
                            <Badge variant="outline" className="text-xs">
                              {model.pipeline_tag.replace('-', ' ')}
                            </Badge>
                          )}
                        </div>
                        {model.downloads > 0 && (
                          <span className="text-xs text-muted-foreground">
                            {model.downloads.toLocaleString()} downloads
                          </span>
                        )}
                      </div>
                      <Check
                        className={cn(
                          "ml-2 h-4 w-4 flex-shrink-0",
                          value === model.id ? "opacity-100" : "opacity-0"
                        )}
                      />
                    </CommandItem>
                  ))}
                  {/* Add manual entry option when there are results but user might want to enter something else */}
                  {search.length > 0 && !models.some(model => model.id === search) && (
                    <CommandItem
                      value={search}
                      onSelect={(currentValue) => {
                        onValueChange(currentValue)
                        setOpen(false)
                        setSearch('')
                      }}
                      className="flex items-center justify-between cursor-pointer border-t"
                    >
                      <div className="flex flex-col gap-1 flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-medium truncate">"{search}"</span>
                          <Badge variant="outline" className="text-xs">
                            manual entry
                          </Badge>
                        </div>
                        <span className="text-xs text-muted-foreground">
                          Use this model ID directly
                        </span>
                      </div>
                      <Check
                        className={cn(
                          "ml-2 h-4 w-4 flex-shrink-0",
                          value === search ? "opacity-100" : "opacity-0"
                        )}
                      />
                    </CommandItem>
                  )}
                </CommandGroup>
              )}
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </div>
  )
}