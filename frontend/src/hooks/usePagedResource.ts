import { useCallback, useEffect, useState } from 'react'
import { useAppContext } from '../context/AppContext'
import { apiRequest } from '../services/api'
import type { PageResult } from '../types'

export function usePagedResource<T>(path: string) {
  const { token } = useAppContext()
  const [data, setData] = useState<PageResult<T> | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [revision, setRevision] = useState(0)
  const reload = useCallback(async () => setRevision((value) => value + 1), [])

  useEffect(() => {
    let active = true
    const timer = window.setTimeout(() => {
      setLoading(true)
      setError('')
      void apiRequest<PageResult<T>>(path, {}, token).then((result) => {
        if (active) setData(result)
      }).catch((reason: unknown) => {
        if (active) setError(reason instanceof Error ? reason.message : 'Unable to load records.')
      }).finally(() => {
        if (active) setLoading(false)
      })
    }, 200)

    return () => {
      active = false
      window.clearTimeout(timer)
    }
  }, [path, revision, token])

  return { data, loading, error, reload }
}
