import { useCallback, useEffect, useRef, useState } from 'react'

export type AsyncState<T> =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'success'; data: T }
  | { status: 'error'; error: Error }

export interface AsyncResult<T> {
  state: AsyncState<T>
  refetch: () => void
}

export function useAsyncWithRefetch<T>(fn: () => Promise<T>, deps: unknown[]): AsyncResult<T> {
  const [state, setState] = useState<AsyncState<T>>({ status: 'idle' })
  const [tick, setTick] = useState(0)
  const cancelRef = useRef<boolean>(false)

  const refetch = useCallback(() => setTick((x) => x + 1), [])

  useEffect(() => {
    cancelRef.current = false
    setState({ status: 'loading' })
    fn()
      .then((data) => {
        if (!cancelRef.current) setState({ status: 'success', data })
      })
      .catch((err: unknown) => {
        if (cancelRef.current) return
        const error = err instanceof Error ? err : new Error(String(err))
        setState({ status: 'error', error })
      })
    return () => {
      cancelRef.current = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, tick])

  return { state, refetch }
}

export function useAsync<T>(fn: () => Promise<T>, deps: unknown[]): AsyncState<T> {
  return useAsyncWithRefetch(fn, deps).state
}
