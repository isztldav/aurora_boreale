"use client"

import { useState, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import { Dialog, DialogContent, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Table, THead, TBody, TR, TH, TD } from '@/components/ui/table'
import { Folder, File, ArrowLeft, Search, Eye, Check, AlertCircle, FolderOpen } from 'lucide-react'
import { cn } from '@/lib/utils'
import { apiEx } from '@/lib/api'

// Types matching backend models
interface FileItem {
  name: string
  path: string
  is_directory: boolean
  size?: number
  modified?: string
}

interface DirectoryContents {
  current_path: string
  parent_path?: string
  items: FileItem[]
}

interface DatasetStructure {
  path: string
  is_valid: boolean
  splits: string[]
  classes: string[]
  class_counts: Record<string, Record<string, number>>
  total_samples: number
  sample_images: string[]
}

interface SmartDatasetSelectorProps {
  value: string
  onChange: (path: string) => void
  onDatasetAnalyzed?: (structure: DatasetStructure) => void
}

export function SmartDatasetSelector({ value, onChange, onDatasetAnalyzed }: SmartDatasetSelectorProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [currentPath, setCurrentPath] = useState('/app/datasets')
  const [contents, setContents] = useState<DirectoryContents | null>(null)
  const [structure, setStructure] = useState<DatasetStructure | null>(null)
  const [loading, setLoading] = useState(false)
  const [analyzing, setAnalyzing] = useState(false)

  const fetchDirectoryContents = useCallback(async (path: string) => {
    setLoading(true)
    try {
      const data: DirectoryContents = await apiEx.datasets.browse(path)
      setContents(data)
      setCurrentPath(data.current_path)
    } catch (error) {
      console.error('Error browsing directory:', error)
    } finally {
      setLoading(false)
    }
  }, [])

  const analyzeDataset = useCallback(async (path: string) => {
    setAnalyzing(true)
    try {
      const data: DatasetStructure = await apiEx.datasets.analyze(path)
      setStructure(data)
      onDatasetAnalyzed?.(data)
    } catch (error) {
      console.error('Error analyzing dataset:', error)
      setStructure(null)
    } finally {
      setAnalyzing(false)
    }
  }, [onDatasetAnalyzed])

  const handleDirectoryClick = (item: FileItem) => {
    if (item.is_directory) {
      fetchDirectoryContents(item.path)
    }
  }

  const handleSelectPath = (path: string) => {
    onChange(path)
    analyzeDataset(path)
  }

  const handleParentClick = () => {
    if (contents?.parent_path) {
      fetchDirectoryContents(contents.parent_path)
    }
  }

  // Initialize when dialog opens
  const handleOpenChange = (open: boolean) => {
    setIsOpen(open)
    if (open && !contents) {
      fetchDirectoryContents(currentPath)
    }
  }

  return (
    <div className="space-y-2">
      <Label>Dataset Path</Label>
      <div className="flex gap-2">
        <Input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="/app/datasets/my-dataset"
        />
        <Dialog open={isOpen} onOpenChange={handleOpenChange}>
          <DialogTrigger asChild>
            <Button variant="outline" size="icon">
              <Search className="h-4 w-4" />
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-4xl h-[600px]">
            <DialogTitle>Select Dataset</DialogTitle>
            <Tabs defaultValue="browse" className="h-full flex flex-col">
              <TabsList>
                <TabsTrigger value="browse">Browse Files</TabsTrigger>
                <TabsTrigger value="analysis" disabled={!structure}>
                  Dataset Analysis {structure?.is_valid && <Check className="ml-1 h-3 w-3" />}
                </TabsTrigger>
                <TabsTrigger value="preview" disabled={!structure?.sample_images?.length}>
                  Data Preview
                </TabsTrigger>
              </TabsList>

              <TabsContent value="browse" className="flex-1">
                <div className="space-y-4 h-full">
                  {/* Navigation */}
                  <div className="flex items-center gap-2 p-2 bg-muted rounded">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={handleParentClick}
                      disabled={!contents?.parent_path}
                    >
                      <ArrowLeft className="h-4 w-4" />
                    </Button>
                    <div className="flex-1 text-sm font-mono bg-background px-2 py-1 rounded">
                      {currentPath}
                    </div>
                    <Button
                      variant="default"
                      size="sm"
                      onClick={() => handleSelectPath(currentPath)}
                      disabled={analyzing}
                    >
                      {analyzing ? "Analyzing..." : "Select This Folder"}
                    </Button>
                  </div>

                  {/* File listing */}
                  <ScrollArea className="flex-1 border rounded">
                    {loading ? (
                      <div className="p-4 text-center text-muted-foreground">Loading...</div>
                    ) : contents?.items.length === 0 ? (
                      <div className="p-4 text-center text-muted-foreground">Empty directory</div>
                    ) : (
                      <Table>
                        <THead>
                          <TR>
                            <TH>Name</TH>
                            <TH>Type</TH>
                            <TH className="text-right">Size</TH>
                          </TR>
                        </THead>
                        <TBody>
                          {contents?.items.map((item) => (
                            <TR
                              key={item.path}
                              className={cn(
                                "cursor-pointer hover:bg-muted",
                                item.is_directory && "font-medium"
                              )}
                              onClick={() => handleDirectoryClick(item)}
                            >
                              <TD className="flex items-center gap-2">
                                {item.is_directory ? (
                                  <Folder className="h-4 w-4 text-blue-500" />
                                ) : (
                                  <File className="h-4 w-4 text-gray-500" />
                                )}
                                {item.name}
                              </TD>
                              <TD>
                                <Badge variant={item.is_directory ? "default" : "outline"}>
                                  {item.is_directory ? "Directory" : "File"}
                                </Badge>
                              </TD>
                              <TD className="text-right text-sm text-muted-foreground">
                                {item.size ? `${Math.round(item.size / 1024)} KB` : "—"}
                              </TD>
                            </TR>
                          ))}
                        </TBody>
                      </Table>
                    )}
                  </ScrollArea>
                </div>
              </TabsContent>

              <TabsContent value="analysis" className="space-y-4 flex-1 overflow-auto">
                {structure && (
                  <div className="space-y-4">
                    <div className="flex items-center gap-2">
                      <div className={cn(
                        "flex items-center gap-2 px-3 py-1 rounded text-sm",
                        structure.is_valid
                          ? "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200"
                          : "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200"
                      )}>
                        {structure.is_valid ? <Check className="h-4 w-4" /> : <AlertCircle className="h-4 w-4" />}
                        {structure.is_valid ? "Valid ImageFolder Structure" : "Invalid Structure"}
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <Card>
                        <CardHeader className="pb-2">
                          <CardTitle className="text-sm">Dataset Overview</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-2">
                          <div className="flex justify-between text-sm">
                            <span>Total Samples:</span>
                            <span className="font-medium">{structure.total_samples.toLocaleString()}</span>
                          </div>
                          <div className="flex justify-between text-sm">
                            <span>Classes:</span>
                            <span className="font-medium">{structure.classes.length}</span>
                          </div>
                          <div className="flex justify-between text-sm">
                            <span>Splits:</span>
                            <span className="font-medium">{structure.splits.join(', ')}</span>
                          </div>
                        </CardContent>
                      </Card>

                      <Card>
                        <CardHeader className="pb-2">
                          <CardTitle className="text-sm">Classes</CardTitle>
                        </CardHeader>
                        <CardContent>
                          <ScrollArea className="h-24">
                            <div className="flex flex-wrap gap-1">
                              {structure.classes.map((cls) => (
                                <Badge key={cls} variant="outline" className="text-xs">
                                  {cls}
                                </Badge>
                              ))}
                            </div>
                          </ScrollArea>
                        </CardContent>
                      </Card>
                    </div>

                    <Card>
                      <CardHeader className="pb-2">
                        <CardTitle className="text-sm">Sample Distribution</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="space-y-3">
                          {Object.entries(structure.class_counts).map(([split, counts]) => (
                            <div key={split}>
                              <div className="text-sm font-medium mb-1 capitalize">{split}</div>
                              <div className="grid grid-cols-4 gap-2 text-xs">
                                {Object.entries(counts).map(([cls, count]) => (
                                  <div key={cls} className="flex justify-between">
                                    <span className="truncate">{cls}:</span>
                                    <span className="font-medium">{count}</span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          ))}
                        </div>
                      </CardContent>
                    </Card>
                  </div>
                )}
              </TabsContent>

              <TabsContent value="preview" className="flex-1 overflow-hidden">
                {structure?.sample_images && (
                  <div className="h-full flex flex-col pt-4">
                    <h4 className="text-sm font-medium mb-3">Sample Images</h4>
                    <ScrollArea className="flex-1">
                      <div className="grid grid-cols-5 gap-2 pr-4 pb-4">
                        {structure.sample_images.slice(0, 15).map((imagePath, idx) => (
                          <DatasetImagePreview key={idx} path={imagePath} />
                        ))}
                      </div>
                    </ScrollArea>
                  </div>
                )}
              </TabsContent>
            </Tabs>
          </DialogContent>
        </Dialog>
      </div>

      {/* Quick analysis below input */}
      {value && structure && (
        <Card className="text-sm">
          <CardContent className="pt-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                {structure.is_valid ? (
                  <Check className="h-4 w-4 text-green-500" />
                ) : (
                  <AlertCircle className="h-4 w-4 text-red-500" />
                )}
                <span>{structure.classes.length} classes, {structure.total_samples.toLocaleString()} samples</span>
              </div>
              <div className="flex gap-1">
                {structure.splits.map(split => (
                  <Badge key={split} variant="outline" className="text-xs">{split}</Badge>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}

function DatasetImagePreview({ path }: { path: string }) {
  const [imageUrl, setImageUrl] = useState<string | null>(null)
  const [error, setError] = useState(false)
  const [loading, setLoading] = useState(false)

  const handleImageLoad = () => {
    if (imageUrl || loading) return // Already loaded or loading

    setLoading(true)
    const url = apiEx.datasets.serveImage(path)
    setImageUrl(url)
  }

  const handleImageError = () => {
    setError(true)
    setLoading(false)
  }

  const handleImageLoadSuccess = () => {
    setLoading(false)
  }

  return (
    <div
      className="aspect-square bg-muted rounded border overflow-hidden cursor-pointer hover:opacity-80 transition-opacity"
      onClick={handleImageLoad}
      title={`Click to preview: ${path}`}
    >
      {imageUrl ? (
        <img
          src={imageUrl}
          alt="Dataset sample"
          className="w-full h-full object-cover"
          onError={handleImageError}
          onLoad={handleImageLoadSuccess}
        />
      ) : error ? (
        <div className="w-full h-full flex items-center justify-center text-xs text-muted-foreground">
          <AlertCircle className="h-4 w-4" />
        </div>
      ) : loading ? (
        <div className="w-full h-full flex items-center justify-center text-xs text-muted-foreground">
          <div className="animate-spin rounded-full h-4 w-4 border-2 border-current border-t-transparent" />
        </div>
      ) : (
        <div className="w-full h-full flex items-center justify-center text-xs text-muted-foreground">
          <Eye className="h-4 w-4" />
        </div>
      )}
    </div>
  )
}