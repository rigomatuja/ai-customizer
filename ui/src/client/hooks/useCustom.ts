import type { CustomType } from '../../shared/schemas'
import { api } from '../api/client'
import { useAsync } from './useAsync'

export function useCustomDetail(type: CustomType, id: string) {
  return useAsync(() => api.custom(type, id), [type, id])
}
