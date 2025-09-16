const EXPLICIT_BASE = (process.env.NEXT_PUBLIC_API_BASE || '').replace(/\/$/, '')
const API_HOST = (process.env.NEXT_PUBLIC_API_HOST || '').replace(/\/$/, '')
// Prefer explicit base (e.g., '/api/v1' behind reverse proxy); otherwise fall back to host + '/api/v1'.
// If neither is set, use relative '/api/v1' so Nginx can route to the backend.
const API_BASE = EXPLICIT_BASE || (API_HOST ? `${API_HOST}/api/v1` : '/api/v1')

async function http<T>(path: string, init?: RequestInit): Promise<T> {
  const headers: Record<string, string> = {}

  // Only add Content-Type for non-FormData requests
  if (!(init?.body instanceof FormData)) {
    headers['Content-Type'] = 'application/json'
  }

  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      ...headers,
      ...(init?.headers || {}),
    },
    // Credentials not needed for this MVP; add if auth appears later
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(text || `HTTP ${res.status}`)
  }
  // Some endpoints may return empty responses
  const ct = res.headers.get('content-type') || ''
  if (!ct.includes('application/json')) return undefined as unknown as T
  return (await res.json()) as T
}

// Types mirror FastAPI pydantic models (snake_case)
export type Project = {
  id: string
  name: string
  description?: string | null
  created_at: string
  updated_at: string
}

export type Run = {
  id: string
  project_id: string
  config_id: string
  group_id?: string | null
  name: string
  state: string
  monitor_metric?: string | null
  monitor_mode?: string | null
  best_value?: number | null
  epoch?: number | null
  step?: number | null
  started_at?: string | null
  finished_at?: string | null
  agent_id?: string | null
  docker_image?: string | null
  seed?: number | null
  log_dir?: string | null
  ckpt_dir?: string | null
  created_at: string
  updated_at: string
  gpu_indices?: number[]
}

export type Agent = {
  id: string
  name: string
  host?: string | null
  labels?: Record<string, unknown> | null
  created_at: string
  updated_at: string
}

export type GPU = {
  id: string
  agent_id: string
  index: number
  uuid?: string | null
  name?: string | null
  total_mem_mb?: number | null
  compute_capability?: string | null
  is_allocated: boolean
  created_at: string
  updated_at: string
}

export type Model = {
  id: string
  project_id: string
  label: string
  hf_checkpoint_id: string
  has_token: boolean  // Indicates if model has a token without exposing it
  notes?: string | null
  default_pretrained: boolean
  created_at: string
  updated_at: string
}

export const api = {
  projects: {
    list: () => http<Project[]>(`/projects`),
    create: (payload: { name: string; description?: string }) => http<Project>(`/projects`, { method: 'POST', body: JSON.stringify(payload) }),
  },
  runs: {
    list: (params: { project_id?: string; state?: string } = {}) => {
      const qs = new URLSearchParams()
      if (params.project_id) qs.set('project_id', params.project_id)
      if (params.state) qs.set('state', params.state)
      const q = qs.toString()
      return http<Run[]>(`/runs${q ? `?${q}` : ''}`)
    },
    get: (runId: string) => http<Run>(`/runs/${runId}`),
    start: (runId: string) => http(`/runs/${runId}/start`, { method: 'POST' }),
    finish: (runId: string, success = true) =>
      http(`/runs/${runId}/finish?success=${success ? 'true' : 'false'}`, { method: 'POST' }),
    cancel: (runId: string) => http(`/runs/${runId}/cancel`, { method: 'POST' }),
    halt: (runId: string) => http(`/runs/${runId}/halt`, { method: 'POST' }),
    status: (runId: string) => http<{ state: string; run_id?: string; name?: string; epoch?: number; total_epochs?: number; started_at?: string; elapsed_seconds?: number; eta_seconds?: number }>(`/runs/${runId}/status`),
    logs: (runId: string, tail = 200) => http<{ lines: string[]; truncated: boolean }>(`/runs/${runId}/logs?tail=${tail}`),
    tensorboard: (runId: string) => http<{ url: string }>(`/runs/${runId}/tensorboard`),
  },
  modelTesting: {
    getRunInfo: (runId: string) => http<{
      run_id: string;
      run_name: string;
      state: string;
      has_checkpoint: boolean;
      num_classes: number;
      class_labels: string[];
      epoch: number;
      best_value: number;
      monitor_metric: string;
      can_test: boolean;
    }>(`/model-testing/${runId}/info`),
    testImage: (runId: string, imageFile: File) => {
      const formData = new FormData();
      formData.append('image', imageFile);
      return http<{
        run_id: string;
        run_name: string;
        predictions: Array<{
          class_id: number;
          class_name: string;
          confidence: number;
          percentage: string;
        }>;
        model_info: {
          model_flavour: string;
          num_classes: number;
          epoch: number;
          best_value: number;
          monitor_metric: string;
        };
      }>(`/model-testing/${runId}/test`, { method: 'POST', body: formData });
    },
    getClasses: (runId: string) => http<{
      run_id: string;
      run_name: string;
      num_classes: number;
      class_labels: string[];
    }>(`/model-testing/${runId}/classes`),
    listTestableRuns: () => http<{
      runs: Array<{
        run_id: string;
        run_name: string;
        project_id: string;
        state: string;
        num_classes: number;
        epoch: number;
        best_value: number;
        monitor_metric: string;
        finished_at: string;
      }>;
    }>(`/model-testing/`),
  },
  groups: {
    list: (projectId: string) => http<{ id: string; name: string }[]>(`/groups/project/${projectId}`),
  },
}

export const apiEx = {
  configs: {
    list: (projectId: string) => http<any[]>(`/configs/project/${projectId}`),
    get: (configId: string) => http<any>(`/configs/${configId}`),
    create: (payload: {
      project_id: string
      name: string
      group_id?: string
      config_json: any
    }) => http(`/configs`, { method: 'POST', body: JSON.stringify(payload) }),
    update: (configId: string, payload: {
      name?: string
      group_id?: string
      config_json?: any
    }) => http(`/configs/${configId}`, { method: 'PUT', body: JSON.stringify(payload) }),
    delete: (configId: string) => http(`/configs/${configId}`, { method: 'DELETE' }),
    queueRun: (configId: string, payload: { agent_id?: string; gpu_indices?: number[]; docker_image?: string; env?: any; priority?: number } = {}) =>
      http(`/runs/from-config/${configId}`, { method: 'POST', body: JSON.stringify(payload) }),
  },
  models: {
    list: (projectId: string) => http<Model[]>(`/projects/${projectId}/models`),
    get: (modelId: string) => http<Model>(`/projects/models/${modelId}`),
    create: (projectId: string, payload: { label: string; hf_checkpoint_id: string; hf_token?: string; notes?: string; default_pretrained?: boolean }) =>
      http<Model>(`/projects/${projectId}/models`, { method: 'POST', body: JSON.stringify(payload) }),
    update: (modelId: string, payload: { label?: string; hf_checkpoint_id?: string; hf_token?: string; notes?: string; default_pretrained?: boolean }) =>
      http<Model>(`/projects/models/${modelId}`, { method: 'PUT', body: JSON.stringify(payload) }),
    delete: (modelId: string) => http(`/projects/models/${modelId}`, { method: 'DELETE' }),
  },
  agents: {
    list: () => http<Agent[]>(`/agents`),
    gpus: (agentId: string) => http<GPU[]>(`/agents/${agentId}/gpus`),
    reserve: (agentId: string, index: number) => http(`/agents/${agentId}/gpus/${index}/reserve`, { method: 'POST' }),
    release: (agentId: string, index: number) => http(`/agents/${agentId}/gpus/${index}/release`, { method: 'POST' }),
  },
  datasets: {
    list: (projectId: string) => http<any[]>(`/projects/${projectId}/datasets`),
    create: (projectId: string, payload: { name: string; root_path: string; split_layout?: any; class_map?: any; sample_stats?: any }) =>
      http(`/projects/${projectId}/datasets`, { method: 'POST', body: JSON.stringify(payload) }),
    delete: (datasetId: string) => http(`/projects/datasets/${datasetId}`, { method: 'DELETE' }),
    browse: (path: string) => http<any>(`/datasets/browse?path=${encodeURIComponent(path)}`),
    analyze: (path: string) => http<any>(`/datasets/analyze?path=${encodeURIComponent(path)}`),
    sampleImages: (paths: string[]) => {
      const searchParams = new URLSearchParams()
      paths.forEach(path => searchParams.append('paths', path))
      return http<any[]>(`/datasets/sample-images?${searchParams.toString()}`)
    },
    serveImage: (path: string) => `/api/v1/datasets/serve-image?path=${encodeURIComponent(path)}`,
  },
  tensorboard: {
    heartbeat: (runId: string) => http(`/tensorboard/heartbeat`, { method: 'POST', body: JSON.stringify({ run_id: runId }) }),
  },
}

export function getApiBase() {
  return API_BASE
}
