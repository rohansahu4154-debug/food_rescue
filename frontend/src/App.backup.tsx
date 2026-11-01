
import { useCallback, useEffect, useState } from 'react'

const API_URL = 'http://localhost:8000'

type Role = 'user' | 'restaurant' | 'ngo' | 'school' | 'agent'
type AuthMode = 'login' | 'register'

type User = {
  id: number
  full_name: string
  email: string
  role: Role
  is_verified: boolean
  is_active: boolean
}

type FoodListing = {
  id: number
  title: string
  description: string | null
  source_type: string
  quantity: number
  unit: string
  price_paise: number
  pickup_location: string
  expires_at: string
}

type TokenResponse = {
  access_token: string
  token_type: string
  expires_in: number
}

async function apiRequest<T>(
  path: string,
  options: RequestInit = {},
  token?: string,
): Promise<T> {
  const response = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
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

    throw new Error(message)
  }

  return response.json() as Promise<T>
}

function App() {
  const [apiStatus, setApiStatus] = useState('Checking...')
  const [listings, setListings] = useState<FoodListing[]>([])
  const [loadingListings, setLoadingListings] = useState(true)
  const [listingError, setListingError] = useState('')

  const [authMode, setAuthMode] = useState<AuthMode>('login')
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [role, setRole] = useState<Role>('user')
  const [authError, setAuthError] = useState('')
  const [authMessage, setAuthMessage] = useState('')
  const [busy, setBusy] = useState(false)

  const [token, setToken] = useState(
    () => sessionStorage.getItem('foodrescue_token') || '',
  )
  const [currentUser, setCurrentUser] = useState<User | null>(null)

  const loadListings = useCallback(async () => {
    setLoadingListings(true)
    setListingError('')

    try {
      const data = await apiRequest<FoodListing[]>('/food-listings')
      setListings(data)
    } catch {
      setListingError('Unable to load food listings. Please try again.')
    } finally {
      setLoadingListings(false)
    }
  }, [])

  useEffect(() => {
    apiRequest<{ status: string }>('/health')
      .then((data) => setApiStatus(data.status))
      .catch(() => setApiStatus('Disconnected'))

    void loadListings()
  }, [loadListings])

  useEffect(() => {
    if (!token) {
      setCurrentUser(null)
      return
    }

    let cancelled = false

    apiRequest<User>('/users/me', {}, token)
      .then((user) => {
        if (!cancelled) setCurrentUser(user)
      })
      .catch(() => {
        if (!cancelled) {
          sessionStorage.removeItem('foodrescue_token')
          setToken('')
          setCurrentUser(null)
        }
      })

    return () => {
      cancelled = true
    }
  }, [token])

  async function handleAuth(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setAuthError('')
    setAuthMessage('')
    setBusy(true)

    try {
      if (authMode === 'register') {
        await apiRequest<User>('/users/register', {
          method: 'POST',
          body: JSON.stringify({
            full_name: fullName.trim(),
            email: email.trim(),
            password,
            role,
          }),
        })

        setAuthMessage('Account created! You can now log in.')
        setAuthMode('login')
        setPassword('')
      } else {
        const result = await apiRequest<TokenResponse>('/users/login', {
          method: 'POST',
          body: JSON.stringify({ email: email.trim(), password }),
        })

        sessionStorage.setItem('foodrescue_token', result.access_token)
        setToken(result.access_token)
        setPassword('')
        setAuthMessage('Login successful!')
      }
    } catch (error) {
      setAuthError(
        error instanceof Error ? error.message : 'Something went wrong.',
      )
    } finally {
      setBusy(false)
    }
  }

  function logout() {
    sessionStorage.removeItem('foodrescue_token')
    setToken('')
    setCurrentUser(null)
    setAuthMessage('You have been logged out.')
    setAuthError('')
  }

  return (
    <main className="min-h-screen bg-green-50 text-gray-800">
      <nav className="flex flex-wrap items-center justify-between gap-4 bg-green-800 p-5 text-white">
        <div>
          <h1 className="text-2xl font-bold">FoodRescue</h1>
          <p className="text-sm text-green-100">
            Rescue food. Feed communities.
          </p>
        </div>

        {currentUser ? (
          <div className="flex items-center gap-3">
            <span className="text-sm">
              {currentUser.full_name} · {currentUser.role}
            </span>
            <button
              onClick={logout}
              className="rounded-lg bg-white px-4 py-2 font-semibold text-green-800 hover:bg-green-50"
            >
              Log out
            </button>
          </div>
        ) : (
          <span className="text-sm">Food for everyone, waste for no one.</span>
        )}
      </nav>

      <section className="mx-auto max-w-5xl p-6 md:p-8">
        <div className="py-8 text-center">
          <h2 className="text-3xl font-bold text-green-900 md:text-4xl">
            Rescue Food. Feed Communities.
          </h2>
          <p className="mx-auto mt-4 max-w-2xl text-lg text-gray-600">
            Connecting surplus food from restaurants and events with people
            and communities who need it.
          </p>
        </div>

        {!currentUser && (
          <section className="mx-auto mb-12 max-w-xl rounded-2xl bg-white p-6 shadow-md md:p-8">
            <div className="mb-6 flex gap-3">
              <button
                type="button"
                onClick={() => {
                  setAuthMode('login')
                  setAuthError('')
                  setAuthMessage('')
                }}
                className={`flex-1 rounded-lg px-4 py-3 font-semibold ${authMode === 'login'
                    ? 'bg-green-700 text-white'
                    : 'bg-green-50 text-green-800'
                  }`}
              >
                Log in
              </button>
              <button
                type="button"
                onClick={() => {
                  setAuthMode('register')
                  setAuthError('')
                  setAuthMessage('')
                }}
                className={`flex-1 rounded-lg px-4 py-3 font-semibold ${authMode === 'register'
                    ? 'bg-green-700 text-white'
                    : 'bg-green-50 text-green-800'
                  }`}
              >
                Register
              </button>
            </div>

            <h3 className="mb-5 text-2xl font-bold text-green-900">
              {authMode === 'login' ? 'Welcome back' : 'Create your account'}
            </h3>

            <form onSubmit={handleAuth} className="space-y-4">
              {authMode === 'register' && (
                <>
                  <label className="block text-sm font-medium">
                    Full name
                    <input
                      required
                      minLength={2}
                      maxLength={120}
                      autoComplete="name"
                      value={fullName}
                      onChange={(event) => setFullName(event.target.value)}
                      className="mt-1 w-full rounded-lg border border-gray-300 p-3"
                      placeholder="Your full name"
                    />
                  </label>

                  <label className="block text-sm font-medium">
                    Account type
                    <select
                      value={role}
                      onChange={(event) => setRole(event.target.value as Role)}
                      className="mt-1 w-full rounded-lg border border-gray-300 bg-white p-3"
                    >
                      <option value="user">Community user</option>
                      <option value="restaurant">Restaurant</option>
                      <option value="ngo">NGO</option>
                      <option value="school">School</option>
                      <option value="agent">Delivery agent</option>
                    </select>
                  </label>
                </>
              )}

              <label className="block text-sm font-medium">
                Email address
                <input
                  required
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  className="mt-1 w-full rounded-lg border border-gray-300 p-3"
                  placeholder="you@example.com"
                />
              </label>

              <label className="block text-sm font-medium">
                Password
                <input
                  required
                  type="password"
                  minLength={authMode === 'register' ? 8 : 1}
                  maxLength={128}
                  autoComplete={
                    authMode === 'login' ? 'current-password' : 'new-password'
                  }
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  className="mt-1 w-full rounded-lg border border-gray-300 p-3"
                  placeholder={
                    authMode === 'register'
                      ? 'At least 8 characters'
                      : 'Enter your password'
                  }
                />
              </label>

              {authError && (
                <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">
                  {authError}
                </p>
              )}

              {authMessage && (
                <p role="status" className="rounded-lg bg-green-50 p-3 text-sm text-green-800">
                  {authMessage}
                </p>
              )}

              <button
                type="submit"
                disabled={busy}
                className="w-full rounded-lg bg-green-700 px-4 py-3 font-semibold text-white hover:bg-green-800 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {busy
                  ? 'Please wait...'
                  : authMode === 'login'
                    ? 'Log in'
                    : 'Create account'}
              </button>
            </form>
          </section>
        )}

        {currentUser && (
          <div className="mb-8 rounded-xl border border-green-200 bg-white p-5 shadow-sm">
            <h3 className="text-xl font-bold text-green-900">
              Welcome, {currentUser.full_name}!
            </h3>
            <p className="mt-1 text-gray-600">
              Signed in as {currentUser.role}. Your account is{' '}
              {currentUser.is_active ? 'active' : 'inactive'}.
            </p>
          </div>
        )}

        <section>
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 className="text-2xl font-bold text-green-900">
                Available Food
              </h2>
              <p className="mt-2 text-gray-600">
                Find available food from our community.
              </p>
            </div>
            <button
              type="button"
              onClick={() => void loadListings()}
              className="rounded-lg border border-green-700 px-4 py-2 font-semibold text-green-800 hover:bg-green-100"
            >
              Refresh listings
            </button>
          </div>

          {loadingListings && (
            <p className="mt-5 rounded-lg bg-white p-5">Loading food listings...</p>
          )}

          {listingError && (
            <p role="alert" className="mt-5 rounded-lg bg-red-100 p-5 text-red-700">
              {listingError}
            </p>
          )}

          {!loadingListings && !listingError && listings.length === 0 && (
            <p className="mt-5 rounded-lg bg-white p-5 text-gray-600 shadow">
              No food listings are currently available.
            </p>
          )}

          {!loadingListings && !listingError && listings.length > 0 && (
            <div className="mt-5 grid gap-5 md:grid-cols-2">
              {listings.map((listing) => (
                <article key={listing.id} className="rounded-xl bg-white p-6 shadow">
                  <div className="flex items-start justify-between gap-3">
                    <h3 className="text-xl font-semibold text-green-800">
                      {listing.title}
                    </h3>
                    <span className="rounded-full bg-green-100 px-3 py-1 text-sm text-green-800">
                      {listing.source_type}
                    </span>
                  </div>
                  <p className="mt-3 text-gray-600">
                    {listing.description || 'No description provided.'}
                  </p>
                  <p className="mt-4">
                    <strong>Quantity:</strong> {listing.quantity} {listing.unit}
                  </p>
                  <p className="mt-2">
                    <strong>Pickup:</strong> {listing.pickup_location}
                  </p>
                  <p className="mt-2">
                    <strong>Price:</strong>{' '}
                    {listing.price_paise === 0
                      ? 'Free'
                      : `₹${(listing.price_paise / 100).toFixed(2)}`}
                  </p>
                  <p className="mt-2 text-sm text-gray-500">
                    Expires: {new Date(listing.expires_at).toLocaleString()}
                  </p>
                </article>
              ))}
            </div>
          )}
        </section>

        <div className="mt-10 rounded-lg bg-white p-4 text-center shadow">
          Backend API status:
          <strong className="ml-2 text-green-700">{apiStatus}</strong>
        </div>
      </section>
    </main>
  )
}

export default App
