import { api } from '../api/client'
import { useAsync } from './useAsync'

export function useCatalogOverview() {
  return useAsync(() => api.catalog(), [])
}

export function useCustomsList() {
  return useAsync(() => api.customs(), [])
}
