import { api } from '../api/client'
import { useAsyncWithRefetch } from './useAsync'

export function useInstallations() {
  return useAsyncWithRefetch(() => api.installations(), [])
}

export function usePlan() {
  return useAsyncWithRefetch(() => api.plan(), [])
}

export function useHistory() {
  return useAsyncWithRefetch(() => api.history(), [])
}

export function useTracker() {
  return useAsyncWithRefetch(() => api.tracker(), [])
}
