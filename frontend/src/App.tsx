import { useCallback, useEffect, useState } from 'react'
import { BrowserRouter, useNavigate } from 'react-router-dom'
import { AppContext } from './context/AppContext'
import { AppRoutes } from './routes/AppRoutes'
import { apiRequest } from './services/api'
import type {
  AppContextValue,
  AuthMode,
  DonationForm,
  FoodClaim,
  FoodListing,
  FoodStats,
  StockClearanceClaim,
  StockClearanceListing,
  StockOfferForm,
  TokenResponse,
  User,
} from './types'

function AppContent() {
  const navigate = useNavigate()
  const [apiStatus, setApiStatus] = useState('Checking...')
  const [listings, setListings] = useState<FoodListing[]>([])
  const [stats, setStats] = useState<FoodStats>({
    total_donations: 0,
    total_claims: 0,
    total_deliveries: 0,
  })
  const [loadingListings, setLoadingListings] = useState(true)
  const [listingError, setListingError] = useState('')

  const [showDonationForm, setShowDonationForm] = useState(false)
  const [donationBusy, setDonationBusy] = useState(false)
  const [donationMessage, setDonationMessage] = useState('')
  const [donationError, setDonationError] = useState('')
  const [donation, setDonation] = useState<DonationForm>({
    title: '',
    description: '',
    source_type: 'restaurant',
    quantity: '10',
    unit: 'meals',
    price_rupees: '0',
    pickup_location: '',
    expires_at: '',
  })

  const [stockListings, setStockListings] = useState<StockClearanceListing[]>([])
  const [stockLoading, setStockLoading] = useState(false)
  const [stockError, setStockError] = useState('')
  const [stockMessage, setStockMessage] = useState('')
  const [stockBusy, setStockBusy] = useState(false)
  const [stockClaimBusy, setStockClaimBusy] = useState<number | null>(null)
  const [stockClaims, setStockClaims] = useState<StockClearanceClaim[]>([])
  const [stockClaimsLoading, setStockClaimsLoading] = useState(false)
  const [stockClaimsError, setStockClaimsError] = useState('')
  const [stockOffer, setStockOffer] = useState<StockOfferForm>({
    title: '',
    description: '',
    quantity: '5',
    unit: 'meals',
    original_price_rupees: '',
    pickup_location: '',
    expires_at: '',
  })
  const [stockClaimQuantities, setStockClaimQuantities] = useState<Record<number, string>>({})

  const [authMode, setAuthMode] = useState<AuthMode>('login')
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [authError, setAuthError] = useState('')
  const [authMessage, setAuthMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const [token, setToken] = useState(() => sessionStorage.getItem('foodrescue_token') || '')
  const [authLoading, setAuthLoading] = useState(() => Boolean(sessionStorage.getItem('foodrescue_token')))
  const [currentUser, setCurrentUser] = useState<User | null>(null)

  const [ngoClaims, setNgoClaims] = useState<FoodClaim[]>([])
  const [claimBusy, setClaimBusy] = useState<number | null>(null)
  const [claimMessage, setClaimMessage] = useState('')
  const [claimError, setClaimError] = useState('')
  const [volunteerTasks, setVolunteerTasks] = useState<FoodClaim[]>([])
  const [taskBusy, setTaskBusy] = useState<number | null>(null)
  const [taskMessage, setTaskMessage] = useState('')
  const [taskError, setTaskError] = useState('')
  const [toast, setToast] = useState<AppContextValue['toast']>(null)

  const showToast = useCallback((message: string, tone: 'success' | 'error' = 'success') => {
    setToast({ message, tone })
  }, [])

  useEffect(() => {
    if (!toast) return
    const timeout = window.setTimeout(() => setToast(null), 4500)
    return () => window.clearTimeout(timeout)
  }, [toast])

  const loadListings = useCallback(async () => {
    setLoadingListings(true)
    setListingError('')
    try {
      setListings(await apiRequest<FoodListing[]>('/food-listings'))
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to load food listings.'
      setListingError(message)
      showToast(message, 'error')
    } finally {
      setLoadingListings(false)
    }
  }, [showToast])

  const loadStockListings = useCallback(async () => {
    setStockLoading(true)
    setStockError('')
    try {
      setStockListings(await apiRequest<StockClearanceListing[]>('/stock-clearance'))
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to load Flash Deals.'
      setStockError(message)
      showToast(message, 'error')
    } finally {
      setStockLoading(false)
    }
  }, [showToast])

  const loadStats = useCallback(async () => {
    try {
      setStats(await apiRequest<FoodStats>('/stats'))
    } catch (error) {
      console.error('Unable to load statistics:', error)
    }
  }, [])

  const loadNgoClaims = useCallback(async () => {
    if (!token || currentUser?.role !== 'ngo') return
    try {
      setNgoClaims(await apiRequest<FoodClaim[]>('/ngo/claims', {}, token))
      setClaimError('')
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to load NGO claims.'
      setClaimError(message)
      showToast(message, 'error')
    }
  }, [currentUser?.role, showToast, token])

  const loadVolunteerTasks = useCallback(async () => {
    if (!token || currentUser?.role !== 'agent') return
    try {
      setVolunteerTasks(await apiRequest<FoodClaim[]>('/volunteer/tasks', {}, token))
      setTaskError('')
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to load volunteer tasks.'
      setTaskError(message)
      showToast(message, 'error')
    }
  }, [currentUser?.role, showToast, token])

  const loadStockClaims = useCallback(async () => {
    if (!token || currentUser?.role !== 'user') {
      return
    }
    setStockClaimsLoading(true)
    setStockClaimsError('')
    try {
      setStockClaims(await apiRequest<StockClearanceClaim[]>('/stock-clearance/my-claims', {}, token))
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to load your Flash Deal claims.'
      setStockClaimsError(message)
      showToast(message, 'error')
    } finally {
      setStockClaimsLoading(false)
    }
  }, [currentUser?.role, showToast, token])

  useEffect(() => {
    void apiRequest<{ status: string }>('/health')
      .then((health) => setApiStatus(health.status))
      .catch(() => setApiStatus('Disconnected'))
    void loadListings()
    void loadStockListings()
    void loadStats()
  }, [loadListings, loadStats, loadStockListings])

  useEffect(() => {
    if (!token) return

    let active = true
    void apiRequest<User>('/users/me', {}, token)
      .then((user) => {
        if (active) setCurrentUser(user)
      })
      .catch(() => {
        if (active) {
          sessionStorage.removeItem('foodrescue_token')
          setToken('')
          setCurrentUser(null)
          setAuthLoading(false)
        }
      })
      .finally(() => {
        if (active) setAuthLoading(false)
      })
    return () => {
      active = false
    }
  }, [token])

  useEffect(() => {
    const invalidateSession = () => {
      sessionStorage.removeItem('foodrescue_token')
      setToken('')
      setCurrentUser(null)
      setNgoClaims([])
      setVolunteerTasks([])
      setStockClaims([])
      setAuthLoading(false)
      navigate('/login', { replace: true })
    }
    window.addEventListener('foodrescue:unauthorized', invalidateSession)
    return () => window.removeEventListener('foodrescue:unauthorized', invalidateSession)
  }, [navigate])

  useEffect(() => {
    void loadNgoClaims()
  }, [loadNgoClaims])

  useEffect(() => {
    void loadVolunteerTasks()
  }, [loadVolunteerTasks])

  useEffect(() => {
    void loadStockClaims()
  }, [loadStockClaims])

  async function handleCreateDonation(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setDonationBusy(true)
    setDonationError('')
    setDonationMessage('')
    try {
      if (!token || currentUser?.role !== 'restaurant') {
        throw new Error('Please log in with a restaurant account.')
      }
      await apiRequest<FoodListing>('/food-listings', {
        method: 'POST',
        body: JSON.stringify({
          title: donation.title.trim(),
          description: donation.description.trim() || null,
          source_type: donation.source_type,
          quantity: Number(donation.quantity),
          unit: donation.unit,
          price_paise: Math.round(Number(donation.price_rupees) * 100),
          pickup_location: donation.pickup_location.trim(),
          expires_at: new Date(donation.expires_at).toISOString(),
        }),
      }, token)
      setDonationMessage('Food donation created successfully!')
      showToast('Food donation created successfully!')
      setDonation({
        title: '', description: '', source_type: 'restaurant', quantity: '10',
        unit: 'meals', price_rupees: '0', pickup_location: '', expires_at: '',
      })
      setShowDonationForm(false)
      await loadListings()
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to create donation.'
      setDonationError(message)
      showToast(message, 'error')
    } finally {
      setDonationBusy(false)
    }
  }

  async function handleCreateStockOffer(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setStockBusy(true)
    setStockError('')
    setStockMessage('')
    try {
      if (!token || currentUser?.role !== 'restaurant') {
        throw new Error('Please log in with a restaurant account.')
      }
      await apiRequest<StockClearanceListing>('/stock-clearance', {
        method: 'POST',
        body: JSON.stringify({
          title: stockOffer.title.trim(),
          description: stockOffer.description.trim() || null,
          quantity: Number(stockOffer.quantity),
          unit: stockOffer.unit,
          original_price_paise: Math.round(Number(stockOffer.original_price_rupees) * 100),
          pickup_location: stockOffer.pickup_location.trim(),
          expires_at: new Date(stockOffer.expires_at).toISOString(),
        }),
      }, token)
      setStockMessage('Discounted food offer created successfully!')
      showToast('Discounted food offer created successfully!')
      setStockOffer({
        title: '', description: '', quantity: '5', unit: 'meals',
        original_price_rupees: '', pickup_location: '', expires_at: '',
      })
      await loadStockListings()
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to create stock-clearance offer.'
      setStockError(message)
      showToast(message, 'error')
    } finally {
      setStockBusy(false)
    }
  }

  async function handleClaimStockOffer(listingId: number) {
    setStockClaimBusy(listingId)
    setStockError('')
    setStockMessage('')
    try {
      if (!token || currentUser?.role !== 'user') {
        throw new Error('Please log in with a community user account to claim food.')
      }
      const quantity = Number(stockClaimQuantities[listingId] ?? '1')
      const listing = stockListings.find((item) => item.id === listingId)
      if (!listing) throw new Error('This offer is no longer available. Refresh the deals.')
      if (!Number.isInteger(quantity) || quantity < 1) {
        throw new Error('Enter a whole-number quantity of at least 1.')
      }
      if (quantity > listing.quantity) {
        throw new Error(`Only ${listing.quantity} units remain in this offer.`)
      }
      const claim = await apiRequest<StockClearanceClaim>(`/stock-clearance/${listingId}/claim`, {
        method: 'POST',
        body: JSON.stringify({ quantity }),
      }, token)
      const message = `Claim successful! ${claim.discount_percent}% discount applied. Price: ₹${(claim.unit_price_paise / 100).toFixed(2)} per ${listing.unit}.`
      setStockMessage(message)
      showToast(message)
      await Promise.all([loadStockListings(), loadStockClaims()])
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to claim this food offer.'
      setStockError(message)
      showToast(message, 'error')
    } finally {
      setStockClaimBusy(null)
    }
  }

  async function handleClaimFood(listingId: number) {
    if (!token || currentUser?.role !== 'ngo') return
    setClaimBusy(listingId)
    setClaimError('')
    setClaimMessage('')
    try {
      await apiRequest<FoodClaim>(`/food-listings/${listingId}/claim`, { method: 'POST' }, token)
      setClaimMessage('Food successfully claimed!')
      showToast('Food successfully claimed!')
      await Promise.all([loadListings(), loadNgoClaims()])
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to claim food.'
      setClaimError(message)
      showToast(message, 'error')
    } finally {
      setClaimBusy(null)
    }
  }

  async function updateTaskStatus(claimId: number, action: 'accept' | 'collect' | 'deliver') {
    if (!token || currentUser?.role !== 'agent') return
    setTaskBusy(claimId)
    setTaskError('')
    setTaskMessage('')
    try {
      await apiRequest<FoodClaim>(`/volunteer/tasks/${claimId}/${action}`, { method: 'POST' }, token)
      const message = action === 'accept'
        ? 'Task accepted!'
        : action === 'collect'
          ? 'Food marked as collected!'
          : 'Food successfully delivered!'
      setTaskMessage(message)
      showToast(message)
      await loadVolunteerTasks()
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to update task.'
      setTaskError(message)
      showToast(message, 'error')
    } finally {
      setTaskBusy(null)
    }
  }

  async function handleAuth(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setAuthError('')
    setAuthMessage('')
    setBusy(true)
    try {
      if (authMode === 'register') {
        await apiRequest<User>('/users/register', {
          method: 'POST',
          body: JSON.stringify({ full_name: fullName.trim(), email: email.trim(), password }),
        })
        setAuthMessage('Account created! You can now log in.')
        showToast('Account created! You can now log in.')
        setAuthMode('login')
        setPassword('')
        navigate('/login')
      } else {
        const result = await apiRequest<TokenResponse>('/users/login', {
          method: 'POST',
          body: JSON.stringify({ email: email.trim(), password }),
        })
        sessionStorage.setItem('foodrescue_token', result.access_token)
        setAuthLoading(true)
        setToken(result.access_token)
        setPassword('')
        setAuthMessage('Login successful!')
        showToast('Login successful!')
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Something went wrong.'
      setAuthError(message)
      showToast(message, 'error')
    } finally {
      setBusy(false)
    }
  }

  function logout() {
    sessionStorage.removeItem('foodrescue_token')
    setToken('')
    setCurrentUser(null)
    setAuthLoading(false)
    setNgoClaims([])
    setVolunteerTasks([])
    setStockClaims([])
    setStockClaimsError('')
    setStockMessage('')
    setStockError('')
    setClaimMessage('')
    setClaimError('')
    setTaskMessage('')
    setTaskError('')
    setAuthMessage('You have been logged out.')
    setAuthError('')
    navigate('/login')
  }

  const contextValue: AppContextValue = {
    apiStatus, listings, stats, loadingListings, listingError,
    showDonationForm, setShowDonationForm, donationBusy, donationMessage, donationError,
    donation, setDonation, stockListings, stockLoading, stockError, stockMessage,
    stockBusy, stockClaimBusy, stockClaims, stockClaimsLoading, stockClaimsError,
    stockOffer, setStockOffer, stockClaimQuantities, setStockClaimQuantities,
    authMode, setAuthMode, fullName, setFullName, email, setEmail, password, setPassword,
    authError, authMessage, busy, token, authLoading, currentUser,
    ngoClaims, claimBusy, claimMessage, claimError, volunteerTasks, taskBusy,
    taskMessage, taskError, toast, setToast, handleCreateDonation, loadListings,
    loadStockListings, handleCreateStockOffer, handleClaimStockOffer, loadStockClaims,
    loadNgoClaims, loadVolunteerTasks, updateTaskStatus, handleClaimFood, handleAuth, logout,
  }

  return (
    <AppContext.Provider value={contextValue}>
      <AppRoutes />
    </AppContext.Provider>
  )
}

function App() {
  return (
    <BrowserRouter>
      <AppContent />
    </BrowserRouter>
  )
}

export default App
