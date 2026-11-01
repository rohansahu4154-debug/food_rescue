const API_URL = (
  import.meta.env.VITE_API_URL || 'http://localhost:8000'
).replace(/\/+$/, '')

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
