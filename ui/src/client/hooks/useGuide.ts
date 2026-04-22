import { api } from '../api/client'
import { useAsyncWithRefetch } from './useAsync'

export function useGuide() {
  return useAsyncWithRefetch(() => api.guide(), [])
}
