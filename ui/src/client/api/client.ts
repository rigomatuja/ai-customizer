import type {
  ApiError,
  AppStateResponse,
  ApplyResponse,
  CatalogOverview,
  CustomDetail,
  CustomsListResponse,
  EffectiveToolState,
  HistoryResponse,
  InstallationsResponse,
  Plan,
  ProjectsResponse,
  ToolsDetectionResponse,
  TrackerResponse,
} from '../../shared/types'
import type {
  CustomType,
  InstallableType,
  InstallationEntry,
  ProjectCreateInput,
  ProjectEntry,
  ProjectUpdateInput,
  ToolsOverride,
  UserConfig,
} from '../../shared/schemas'

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, init)
  if (!res.ok) {
    let err: ApiError
    try {
      err = (await res.json()) as ApiError
    } catch {
      err = { error: `HTTP ${res.status}` }
    }
    throw new ApiClientError(err.error, res.status, err.code, err.details)
  }
  return res.json() as Promise<T>
}

function jsonPost<T>(path: string, body: unknown): Promise<T> {
  return request<T>(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

function jsonPut<T>(path: string, body: unknown): Promise<T> {
  return request<T>(path, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

function jsonDelete<T>(path: string): Promise<T> {
  return request<T>(path, { method: 'DELETE' })
}

export class ApiClientError extends Error {
  constructor(
    message: string,
    public status: number,
    public code?: string,
    public details?: unknown,
  ) {
    super(message)
    this.name = 'ApiClientError'
  }
}

export const api = {
  health: () => request<{ ok: boolean; service: string; version: string; milestone: string }>('/api/health'),
  catalog: () => request<CatalogOverview>('/api/catalog'),
  customs: () => request<CustomsListResponse>('/api/customs'),
  custom: (type: CustomType, id: string) =>
    request<CustomDetail>(`/api/customs/${type}/${encodeURIComponent(id)}`),

  state: () => request<AppStateResponse>('/api/state'),
  initState: () => jsonPost<{ initialized: boolean; config: UserConfig }>('/api/state/init', {}),
  updateToolsOverride: (override: ToolsOverride | null) =>
    jsonPost<{ config: UserConfig }>('/api/state/tools-override', override),

  projects: () => request<ProjectsResponse>('/api/state/projects'),
  createProject: (input: ProjectCreateInput) =>
    jsonPost<ProjectEntry>('/api/state/projects', input),
  updateProject: (id: string, input: ProjectUpdateInput) =>
    jsonPut<ProjectEntry>(`/api/state/projects/${encodeURIComponent(id)}`, input),
  deleteProject: (id: string) =>
    jsonDelete<{ deleted: boolean }>(`/api/state/projects/${encodeURIComponent(id)}`),

  tools: () => request<{ detection: ToolsDetectionResponse; effective: EffectiveToolState }>('/api/tools'),

  installations: () => request<InstallationsResponse>('/api/installations'),
  upsertInstallation: (entry: InstallationEntry) =>
    jsonPost<InstallationEntry>('/api/installations', entry),
  removeInstallation: (customType: InstallableType, customId: string) =>
    jsonDelete<{ deleted: boolean }>(
      `/api/installations/${customType}/${encodeURIComponent(customId)}`,
    ),

  plan: () => request<Plan>('/api/apply/plan'),
  apply: () => jsonPost<ApplyResponse>('/api/apply', {}),
  history: () => request<HistoryResponse>('/api/apply/history'),
  tracker: () => request<TrackerResponse>('/api/apply/tracker'),
}
