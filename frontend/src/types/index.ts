import type { FormEvent } from 'react'

export type Role = 'user' | 'restaurant' | 'ngo' | 'school' | 'agent' | 'admin'
export type AuthMode = 'login' | 'register'

export type User = {
  id: number
  full_name: string
  email: string
  role: Role
  is_verified: boolean
  is_active: boolean
}

export type FoodListing = {
  id: number
  title: string
  description: string | null
  source_type: 'restaurant' | 'event'
  quantity: number
  unit: string
  price_paise: number
  pickup_location: string
  expires_at: string
  is_available: boolean
  created_at: string
  creator_id: number
}

export type FoodClaim = {
  id: number
  listing_id: number
  ngo_id: number
  volunteer_id: number | null
  status: string
  claimed_at: string
  collected_at: string | null
  delivered_at: string | null
}

export type VolunteerTask = FoodClaim & {
  listing: {
    id: number
    title: string
    quantity: number
    unit: string
    pickup_location: string
    expires_at: string
  }
}

export type FoodStats = {
  total_donations: number
  total_claims: number
  total_deliveries: number
}

export type StockClearanceListing = {
  id: number
  title: string
  description: string | null
  quantity: number
  unit: string
  original_price_paise: number
  pickup_location: string
  expires_at: string
  is_available: boolean
  created_at: string
  creator_id: number
  discount_percent: number
  discounted_price_paise: number
}

export type StockClearanceClaim = {
  id: number
  listing_id: number
  customer_id: number
  quantity: number
  discount_percent: number
  unit_price_paise: number
  claimed_at: string
}

export type AdminUser = User
export type NotificationItem = {
  id: number
  user_id: number
  title: string
  message: string
  category: string
  created_at: string
  read_at: string | null
}

export type AdminAuditLog = {
  id: number
  admin_id: number
  actor_type: string
  action: string
  resource_type: string
  resource_id: number | null
  details: Record<string, unknown>
  created_at: string
}

export type PageResult<T> = {
  items: T[]
  total: number
  limit: number
  offset: number
}

export type TokenResponse = {
  access_token: string
  token_type: string
  expires_in: number
}

export type DonationForm = {
  title: string
  description: string
  source_type: string
  quantity: string
  unit: string
  price_rupees: string
  pickup_location: string
  expires_at: string
}

export type StockOfferForm = {
  title: string
  description: string
  quantity: string
  unit: string
  original_price_rupees: string
  pickup_location: string
  expires_at: string
}

export type AppContextValue = {
  apiStatus: string
  listings: FoodListing[]
  stats: FoodStats
  loadingListings: boolean
  listingError: string
  showDonationForm: boolean
  setShowDonationForm: (show: boolean) => void
  donationBusy: boolean
  donationMessage: string
  donationError: string
  donation: DonationForm
  setDonation: (donation: DonationForm) => void
  stockListings: StockClearanceListing[]
  stockLoading: boolean
  stockError: string
  stockMessage: string
  stockBusy: boolean
  stockClaimBusy: number | null
  stockClaims: StockClearanceClaim[]
  stockClaimsLoading: boolean
  stockClaimsError: string
  stockOffer: StockOfferForm
  setStockOffer: (offer: StockOfferForm) => void
  stockClaimQuantities: Record<number, string>
  setStockClaimQuantities: (quantities: Record<number, string>) => void
  authMode: AuthMode
  setAuthMode: (mode: AuthMode) => void
  fullName: string
  setFullName: (name: string) => void
  email: string
  setEmail: (email: string) => void
  password: string
  setPassword: (password: string) => void
  authError: string
  authMessage: string
  busy: boolean
  token: string
  authLoading: boolean
  currentUser: User | null
  ngoClaims: FoodClaim[]
  claimBusy: number | null
  claimMessage: string
  claimError: string
  volunteerTasks: FoodClaim[]
  taskBusy: number | null
  taskMessage: string
  taskError: string
  toast: { message: string; tone: 'success' | 'error' } | null
  setToast: (toast: { message: string; tone: 'success' | 'error' } | null) => void
  handleCreateDonation: (event: FormEvent<HTMLFormElement>) => Promise<void>
  loadListings: () => Promise<void>
  loadStockListings: () => Promise<void>
  handleCreateStockOffer: (event: FormEvent<HTMLFormElement>) => Promise<void>
  handleClaimStockOffer: (listingId: number) => Promise<void>
  loadStockClaims: () => Promise<void>
  loadNgoClaims: () => Promise<void>
  loadVolunteerTasks: () => Promise<void>
  updateTaskStatus: (claimId: number, action: 'accept' | 'collect' | 'deliver') => Promise<void>
  handleClaimFood: (listingId: number) => Promise<void>
  handleAuth: (event: FormEvent<HTMLFormElement>) => Promise<void>
  logout: () => void
}
