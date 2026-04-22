import { api } from '../api/client'
import { useAsync, useAsyncWithRefetch } from './useAsync'

export function useAppState() {
  return useAsyncWithRefetch(() => api.state(), [])
}

export function useTools() {
  return useAsync(() => api.tools(), [])
}

export function useProjects() {
  return useAsyncWithRefetch(() => api.projects(), [])
}
