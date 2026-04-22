import type {
  ApiError,
  CatalogOverview,
  CustomDetail,
  CustomsListResponse,
} from '../../shared/types'
import type { CustomType } from '../../shared/schemas'

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
  custom: (type: CustomType, id: string) => request<CustomDetail>(`/api/customs/${type}/${encodeURIComponent(id)}`),
}
