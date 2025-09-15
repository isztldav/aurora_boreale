"use client"

import { useState, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Dialog, DialogContent, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { RefreshCw, Eye, Check, AlertCircle, Database } from 'lucide-react'
import { cn } from '@/lib/utils'
import { apiEx } from '@/lib/api'

// Types matching backend models
interface DatasetStructure {
  path: string
  is_valid: boolean
  splits: string[]
  classes: string[]
  class_counts: Record<string, Record<string, number>>
  total_samples: number
  sample_images: string[]
}

interface DatasetViewerProps {
  dataset: {
    id: string
    name: string
    root_path: string
    split_layout?: any
    class_map?: any
    sample_stats?: any
  }
  onUpdate?: () => void
}

export function DatasetViewer({ dataset, onUpdate }: DatasetViewerProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [structure, setStructure] = useState<DatasetStructure | null>(null)
  const [analyzing, setAnalyzing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const analyzeDataset = useCallback(async () => {
    setAnalyzing(true)
    setError(null)
    try {
      const data: DatasetStructure = await apiEx.datasets.analyze(dataset.root_path)
      setStructure(data)
    } catch (error: any) {
      console.error('Error analyzing dataset:', error)
      setError(error.message || 'Failed to analyze dataset')
      setStructure(null)
    } finally {
      setAnalyzing(false)
    }
  }, [dataset.root_path])

  const handleOpenChange = (open: boolean) => {
    setIsOpen(open)
    if (open && !structure && !analyzing) {
      analyzeDataset()
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Eye className="h-4 w-4 mr-1" />
          View
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-4xl h-[600px] flex flex-col">
        <div className="flex items-center justify-between pb-4 border-b">
          <DialogTitle className="flex items-center gap-2">
            <Database className="h-5 w-5" />
            {dataset.name}
          </DialogTitle>
          <Button
            variant="outline"
            size="sm"
            onClick={analyzeDataset}
            disabled={analyzing}
          >
            <RefreshCw className={cn("h-4 w-4 mr-2", analyzing && "animate-spin")} />
            {analyzing ? "Analyzing..." : "Refresh"}
          </Button>
        </div>

        <div className="flex-1 min-h-0">
          {error ? (
            <div className="flex items-center justify-center h-full">
              <div className="text-center space-y-2">
                <AlertCircle className="h-12 w-12 text-red-500 mx-auto" />
                <p className="text-sm text-muted-foreground">{error}</p>
                <Button onClick={analyzeDataset} disabled={analyzing}>
                  Try Again
                </Button>
              </div>
            </div>
          ) : analyzing ? (
            <div className="flex items-center justify-center h-full">
              <div className="text-center space-y-2">
                <RefreshCw className="h-8 w-8 animate-spin mx-auto text-muted-foreground" />
                <p className="text-sm text-muted-foreground">Analyzing dataset structure...</p>
              </div>
            </div>
          ) : structure ? (
          <Tabs defaultValue="overview" className="h-full flex flex-col pt-4">
            <TabsList className="mb-4">
              <TabsTrigger value="overview">Overview</TabsTrigger>
              <TabsTrigger value="structure">Structure</TabsTrigger>
              <TabsTrigger value="preview" disabled={!structure?.sample_images?.length}>
                Data Preview
              </TabsTrigger>
            </TabsList>

            <TabsContent value="overview" className="flex-1 overflow-auto">
              <div className="space-y-4 pb-4">
                {/* Validation Status */}
                <div className="flex items-center gap-2">
                  <div className={cn(
                    "flex items-center gap-2 px-3 py-2 rounded text-sm font-medium",
                    structure.is_valid
                      ? "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200"
                      : "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200"
                  )}>
                    {structure.is_valid ? <Check className="h-4 w-4" /> : <AlertCircle className="h-4 w-4" />}
                    {structure.is_valid ? "Valid Training Dataset" : "Invalid Dataset Structure"}
                  </div>
                </div>

                {!structure.is_valid && (
                  <Card className="border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-950">
                    <CardContent className="pt-4">
                      <p className="text-sm text-red-700 dark:text-red-300">
                        This dataset structure is not compatible with the training system.
                        Ensure your dataset follows the ImageFolder format with train/val/test splits.
                      </p>
                    </CardContent>
                  </Card>
                )}

                {/* Basic Info */}
                <div className="grid grid-cols-2 gap-4">
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm">Dataset Information</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2">
                      <div className="flex justify-between text-sm">
                        <span>Path:</span>
                        <span className="font-mono text-xs truncate max-w-[200px]" title={structure.path}>
                          {structure.path}
                        </span>
                      </div>
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
                        <div className="flex gap-1">
                          {structure.splits.map(split => (
                            <Badge key={split} variant="outline" className="text-xs">{split}</Badge>
                          ))}
                        </div>
                      </div>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm">Classes</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <ScrollArea className="h-32">
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
              </div>
            </TabsContent>

            <TabsContent value="structure" className="flex-1 overflow-hidden">
              <div className="h-full flex flex-col">
                <h4 className="text-sm font-medium mb-3">Sample Distribution by Split</h4>
                <ScrollArea className="flex-1">
                  <div className="space-y-3 pr-4 pb-4">
                    {Object.entries(structure.class_counts).map(([split, counts]) => (
                      <Card key={split}>
                        <CardHeader className="pb-2">
                          <CardTitle className="text-sm capitalize flex items-center gap-2">
                            {split}
                            <Badge variant="outline" className="text-xs">
                              {Object.values(counts).reduce((a, b) => a + b, 0)} samples
                            </Badge>
                          </CardTitle>
                        </CardHeader>
                        <CardContent>
                          <div className="grid grid-cols-3 gap-3 text-sm">
                            {Object.entries(counts).map(([cls, count]) => (
                              <div key={cls} className="flex justify-between p-2 bg-muted rounded">
                                <span className="truncate pr-2">{cls}</span>
                                <span className="font-medium">{count}</span>
                              </div>
                            ))}
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                </ScrollArea>
              </div>
            </TabsContent>

            <TabsContent value="preview" className="flex-1 overflow-hidden">
              {structure?.sample_images && (
                <div className="h-full flex flex-col">
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
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  )
}

function DatasetImagePreview({ path }: { path: string }) {
  const [imageUrl, setImageUrl] = useState<string | null>(null)
  const [error, setError] = useState(false)
  const [loading, setLoading] = useState(false)

  const handleImageLoad = () => {
    if (imageUrl || loading) return

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