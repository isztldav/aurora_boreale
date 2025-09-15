export type HuggingFaceModel = {
  _id: string
  id: string
  modelId: string
  likes: number
  trendingScore?: number
  private: boolean
  downloads: number
  tags: string[]
  pipeline_tag: string | null
  library_name: string | null
  createdAt: string
}

export type ModelFilter = {
  search?: string
  filter?: string  // For pipeline_tag filtering
  library?: string
  author?: string
  sort?: string
  direction?: number
  limit?: number
}

const HUGGINGFACE_API_BASE = 'https://huggingface.co/api'

/**
 * Search HuggingFace models using their official API
 */
export async function searchHuggingFaceModels(filter: ModelFilter = {}): Promise<HuggingFaceModel[]> {
  const params = new URLSearchParams()

  if (filter.search) {
    params.set('search', filter.search)
  }

  if (filter.filter) {
    params.set('filter', filter.filter)
  }

  if (filter.library) {
    params.set('library', filter.library)
  }

  if (filter.author) {
    params.set('author', filter.author)
  }

  if (filter.sort) {
    params.set('sort', filter.sort)
  }

  if (filter.direction) {
    params.set('direction', filter.direction.toString())
  }

  // Default limit for autocomplete
  params.set('limit', String(filter.limit || 20))

  try {
    const response = await fetch(`${HUGGINGFACE_API_BASE}/models?${params.toString()}`)

    if (!response.ok) {
      throw new Error(`HuggingFace API error: ${response.status}`)
    }

    const models: HuggingFaceModel[] = await response.json()
    return models
  } catch (error) {
    console.error('Failed to search HuggingFace models:', error)
    return []
  }
}

/**
 * Get models filtered for image classification and feature extraction tasks
 * These are the supported task types in the training platform
 */
export async function getImageModels(search?: string): Promise<HuggingFaceModel[]> {
  // Search for both image classification and image feature extraction models
  const [classificationModels, featureExtractionModels] = await Promise.all([
    searchHuggingFaceModels({
      search,
      filter: 'image-classification',
      sort: 'downloads',
      direction: -1
    }),
    searchHuggingFaceModels({
      search,
      filter: 'image-feature-extraction',
      sort: 'downloads',
      direction: -1
    })
  ])

  // Combine and deduplicate results
  const allModels = [...classificationModels, ...featureExtractionModels]
  const uniqueModels = Array.from(
    new Map(allModels.map(model => [model.id, model])).values()
  )

  // Sort by download count (popularity) if available
  return uniqueModels.sort((a, b) => (b.downloads || 0) - (a.downloads || 0))
}

/**
 * Get the supported task categories for the training platform
 */
export const SUPPORTED_TASKS = [
  'image-classification',
  'image-feature-extraction'
] as const

export type SupportedTask = typeof SUPPORTED_TASKS[number]