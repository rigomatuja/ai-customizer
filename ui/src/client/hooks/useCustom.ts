import type { CustomType } from '../../shared/schemas'
import { api } from '../api/client'
import { useAsyncWithRefetch } from './useAsync'

export function useCustomDetail(type: CustomType, id: string) {
  return useAsyncWithRefetch(() => api.custom(type, id), [type, id])
}
