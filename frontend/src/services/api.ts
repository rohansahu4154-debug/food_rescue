const configuredApiUrl = import.meta.env.VITE_API_URL?.trim()

if (import.meta.env.PROD && !configuredApiUrl) {
  throw new Error('VITE_API_URL must be configured for the production frontend.')
}

const API_URL = (configuredApiUrl || 'http://localhost:8000').replace(/\/+$/, '')

if (
  import.meta.env.PROD &&
  ['localhost', '127.0.0.1'].includes(new URL(API_URL).hostname)
) {
  throw new Error('VITE_API_URL must point to the deployed API in production.')
}

export async function apiRequest<T>(
  path: string,
  options: RequestInit = {},
  token?: string,
): Promise<T> {
  const activeToken = token ?? sessionStorage.getItem('foodrescue_token') ?? ''
  const response = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...(activeToken ? { Authorization: `Bearer ${activeToken}` } : {}),
      ...options.headers,
    },
  })

  if (!response.ok) {
    const body = await response.json().catch(() => null)
    const detail = body?.detail
    const message = Array.isArray(detail)
      ? detail.map((item: { msg?: string }) => item.msg).join(', ')
      : typeof detail === 'string'
        ? detail
        : `Request failed (${response.status})`

    if (response.status === 401 && activeToken) {
      window.dispatchEvent(new Event('foodrescue:unauthorized'))
    }

    throw new Error(message)
  }

  if (response.status === 204) {
    return undefined as T
  }

  return response.json() as Promise<T>
}
