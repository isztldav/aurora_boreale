"use client"

import { useState, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'

interface ModelTestingDialogProps {
  runId: string | null
  onOpenChange: (open: boolean) => void
}

export function ModelTestingDialog({ runId, onOpenChange }: ModelTestingDialogProps) {
  const [selectedImage, setSelectedImage] = useState<File | null>(null)
  const [imagePreview, setImagePreview] = useState<string | null>(null)
  const [isUploading, setIsUploading] = useState(false)
  const [testResults, setTestResults] = useState<any>(null)
  const [error, setError] = useState<string | null>(null)

  const { data: runInfo, isLoading: loadingInfo, error: infoError } = useQuery({
    queryKey: ['model-testing-info', { runId }],
    queryFn: () => api.modelTesting.getRunInfo(runId!),
    enabled: !!runId,
    retry: false, // Don't retry on error for immediate feedback
  })

  const handleImageSelect = (file: File) => {
    setSelectedImage(file)
    setTestResults(null)
    setError(null)

    // Create preview
    const reader = new FileReader()
    reader.onload = (e) => {
      setImagePreview(e.target?.result as string)
    }
    reader.readAsDataURL(file)
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    const files = Array.from(e.dataTransfer.files)
    const imageFile = files.find(f => f.type.startsWith('image/'))
    if (imageFile) {
      handleImageSelect(imageFile)
    }
  }

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      handleImageSelect(file)
    }
  }

  const handleTest = async () => {
    if (!selectedImage || !runId) return

    setIsUploading(true)
    setError(null)

    try {
      const result = await api.modelTesting.testImage(runId, selectedImage)
      setTestResults(result)
    } catch (err: any) {
      // Provide user-friendly error messages for common issues
      let errorMessage = err.message || 'Failed to test image'

      if (errorMessage.includes('No class labels found')) {
        errorMessage = 'This model cannot be tested because it was not trained with proper class labels. Please retrain the model.'
      } else if (errorMessage.includes('Checkpoint not found')) {
        errorMessage = 'Model checkpoint not found. The training may have failed or been interrupted.'
      } else if (errorMessage.includes('Config not found')) {
        errorMessage = 'Training configuration not found. This model may be from an older version.'
      } else if (errorMessage.includes('Invalid image format')) {
        errorMessage = 'Invalid image format. Please upload a valid JPG, PNG, or WebP image.'
      } else if (errorMessage.includes('Image too large')) {
        errorMessage = 'Image is too large. Please upload an image smaller than 10MB.'
      } else if (errorMessage.includes('Failed to load model architecture')) {
        errorMessage = 'Could not load the model architecture. The model may be incompatible or corrupted.'
      } else if (errorMessage.includes('Failed to load trained weights')) {
        errorMessage = 'Could not load the trained model weights. The checkpoint may be corrupted.'
      } else if (errorMessage.includes('Image preprocessing failed')) {
        errorMessage = 'Failed to process the image. Please try a different image.'
      }

      setError(errorMessage)
    } finally {
      setIsUploading(false)
    }
  }

  const reset = () => {
    setSelectedImage(null)
    setImagePreview(null)
    setTestResults(null)
    setError(null)
  }

  // Reset state when runId changes or dialog opens/closes
  useEffect(() => {
    if (runId) {
      reset()
    }
  }, [runId])

  return (
    <Dialog open={!!runId} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[900px] w-[95vw]">
        <div className="flex items-center justify-between mb-4">
          <DialogTitle>Test Model{runInfo ? ` • ${runInfo.run_name}` : ''}</DialogTitle>
          <Button variant="outline" size="sm" onClick={reset}>
            Reset
          </Button>
        </div>

        {loadingInfo ? (
          <div className="text-sm">Loading model info…</div>
        ) : infoError ? (
          <div className="border border-red-200 bg-red-50 rounded-lg p-4">
            <div className="flex items-start space-x-3">
              <div className="text-red-500 mt-0.5">
                <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                </svg>
              </div>
              <div>
                <div className="text-sm font-medium text-red-800 mb-1">
                  Model Not Available
                </div>
                <div className="text-sm text-red-700">
                  {(infoError as any)?.message || 'Failed to load model information. The model may not be available for testing.'}
                </div>
              </div>
            </div>
          </div>
        ) : !runInfo?.can_test ? (
          <div className="border border-yellow-200 bg-yellow-50 rounded-lg p-4">
            <div className="flex items-start space-x-3">
              <div className="text-yellow-500 mt-0.5">
                <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                </svg>
              </div>
              <div>
                <div className="text-sm font-medium text-yellow-800 mb-1">
                  Testing Not Available
                </div>
                <div className="text-sm text-yellow-700">
                  This model cannot be tested. Ensure the run completed successfully and has a checkpoint available.
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Model Info */}
            <div className="bg-muted p-3 rounded text-sm">
              <div className="font-medium">Model Information</div>
              <div className="mt-1 space-y-1">
                <div>Classes: {runInfo.num_classes}</div>
                <div>Epoch: {runInfo.epoch}</div>
                <div>Best {runInfo.monitor_metric}: {runInfo.best_value}</div>
                {runInfo.class_labels.length > 0 && (
                  <div>
                    Labels: {runInfo.class_labels.slice(0, 5).join(', ')}
                    {runInfo.class_labels.length > 5 && ` ... (+${runInfo.class_labels.length - 5} more)`}
                  </div>
                )}
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {/* Image Upload */}
              <div>
                <div className="text-sm font-medium mb-2">Upload Image</div>
                {!selectedImage ? (
                  <div
                    className="border-2 border-dashed border-muted-foreground/25 rounded-lg p-8 text-center cursor-pointer hover:border-muted-foreground/50 transition-colors"
                    onDrop={handleDrop}
                    onDragOver={(e) => e.preventDefault()}
                    onClick={() => document.getElementById('image-upload')?.click()}
                  >
                    <div className="text-muted-foreground mb-2">
                      Drag and drop an image here, or click to select
                    </div>
                    <div className="text-xs text-muted-foreground">
                      Supports JPG, PNG, WebP (max 10MB)
                    </div>
                    <input
                      id="image-upload"
                      type="file"
                      accept="image/*"
                      onChange={handleFileInput}
                      className="hidden"
                    />
                  </div>
                ) : (
                  <div className="space-y-2">
                    <div className="relative">
                      <img
                        src={imagePreview!}
                        alt="Preview"
                        className="w-full h-48 object-contain border rounded"
                      />
                    </div>
                    <div className="flex gap-2">
                      <Button onClick={handleTest} disabled={isUploading} className="flex-1">
                        {isUploading ? 'Testing...' : 'Test Image'}
                      </Button>
                      <Button variant="outline" onClick={reset}>
                        Change Image
                      </Button>
                    </div>
                  </div>
                )}
              </div>

              {/* Results */}
              <div>
                <div className="text-sm font-medium mb-2">Predictions</div>
                {error ? (
                  <div className="border border-red-200 bg-red-50 rounded-lg p-4">
                    <div className="flex items-start space-x-3">
                      <div className="text-red-500 mt-0.5">
                        <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                        </svg>
                      </div>
                      <div>
                        <div className="text-sm font-medium text-red-800 mb-1">
                          Testing Failed
                        </div>
                        <div className="text-sm text-red-700">
                          {error}
                        </div>
                        <div className="mt-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setError(null)}
                            className="text-red-600 border-red-200 hover:bg-red-100"
                          >
                            Try Again
                          </Button>
                        </div>
                      </div>
                    </div>
                  </div>
                ) : !testResults ? (
                  <div className="text-sm text-muted-foreground bg-muted p-3 rounded">
                    Upload an image to see predictions
                  </div>
                ) : (
                  <div className="space-y-2 max-h-48 overflow-y-auto">
                    {testResults.predictions.slice(0, 10).map((pred: any, idx: number) => (
                      <div
                        key={idx}
                        className={`flex items-center justify-between p-2 rounded ${
                          idx === 0 ? 'bg-primary/10 border-primary/20 border' : 'bg-muted'
                        }`}
                      >
                        <div className="font-medium">{pred.class_name}</div>
                        <div className="text-sm">
                          {pred.percentage}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}