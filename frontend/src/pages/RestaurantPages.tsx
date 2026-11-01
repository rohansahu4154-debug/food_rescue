import { useEffect, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { HandHeart, PackagePlus, Truck } from 'lucide-react'
import { useAppContext } from '../context/AppContext'
import { EmptyState, ErrorState, LoadingState, PageHeader } from '../components/PagePrimitives'
import { apiRequest } from '../services/api'
import type {
  FoodClaim,
  FoodListing,
  PageResult,
  StockClearanceClaim,
  StockClearanceListing,
} from '../types'

type FoodListingHistory = FoodListing & { claims: FoodClaim[] }
type RestaurantAnalytics = {
  donations_posted: number
  food_claims: number
  deliveries_completed: number
}

type EditableListingFields = {
  title: string
  description: string | null
  pickup_location: string
}

function listingStatus(isAvailable: boolean, expiresAt: string) {
  if (new Date(expiresAt).getTime() <= Date.now()) return 'Expired'
  return isAvailable ? 'Available' : 'Unavailable'
}

function EditListingForm({
  path,
  listing,
  onSaved,
}: {
  path: string
  listing: EditableListingFields
  onSaved: () => void | Promise<void>
}) {
  const { token } = useAppContext()
  const [open, setOpen] = useState(false)
  const [fields, setFields] = useState({
    title: listing.title,
    description: listing.description ?? '',
    pickup_location: listing.pickup_location,
  })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setBusy(true)
    setError('')
    try {
      await apiRequest(path, {
        method: 'PUT',
        body: JSON.stringify({
          title: fields.title.trim(),
          description: fields.description.trim() || null,
          pickup_location: fields.pickup_location.trim(),
        }),
      }, token)
      setOpen(false)
      await onSaved()
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to edit this listing.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="listing-edit">
      <button type="button" className="button button-secondary" onClick={() => setOpen((value) => !value)}>
        {open ? 'Close edit' : 'Edit listing'}
      </button>
      {open ? <form className="listing-edit-form" onSubmit={(event) => void save(event)}>
        <label>Title<input required minLength={2} maxLength={150} value={fields.title} onChange={(event) => setFields({ ...fields, title: event.target.value })} /></label>
        <label>Description<textarea maxLength={2000} value={fields.description} onChange={(event) => setFields({ ...fields, description: event.target.value })} /></label>
        <label>Pickup location<input required minLength={3} maxLength={255} value={fields.pickup_location} onChange={(event) => setFields({ ...fields, pickup_location: event.target.value })} /></label>
        {error ? <ErrorState message={error} /> : null}
        <button type="submit" className="button button-primary" disabled={busy}>{busy ? 'Saving...' : 'Save changes'}</button>
      </form> : null}
    </div>
  )
}

function CancelListingButton({
  path,
  onCancelled,
}: {
  path: string
  onCancelled: () => void | Promise<void>
}) {
  const { token } = useAppContext()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function cancelListing() {
    setBusy(true)
    setError('')
    try {
      await apiRequest(path, {
        method: 'PATCH',
        body: JSON.stringify({ is_available: false }),
      }, token)
      await onCancelled()
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to cancel this listing.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <button type="button" className="button button-secondary" disabled={busy} onClick={() => void cancelListing()}>
        {busy ? 'Cancelling...' : 'Cancel listing'}
      </button>
      {error ? <ErrorState message={error} /> : null}
    </>
  )
}

function useRestaurantHistory<T>(path: string) {
  const { token } = useAppContext()
  const [data, setData] = useState<PageResult<T> | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [revision, setRevision] = useState(0)

  useEffect(() => {
    let active = true
    const timer = window.setTimeout(() => {
      setLoading(true)
      setError('')
      void apiRequest<PageResult<T>>(path, {}, token).then((result) => {
        if (active) setData(result)
      }).catch((reason: unknown) => {
        if (active) setError(reason instanceof Error ? reason.message : 'Unable to load listing history.')
      }).finally(() => {
        if (active) setLoading(false)
      })
    }, 250)

    return () => {
      active = false
      window.clearTimeout(timer)
    }
  }, [path, revision, token])

  return { data, loading, error, refresh: () => setRevision((value) => value + 1) }
}

function HistoryControls({
  search,
  onSearch,
  availability,
  onAvailability,
  sort,
  onSort,
}: {
  search: string
  onSearch: (value: string) => void
  availability: string
  onAvailability: (value: string) => void
  sort: string
  onSort: (value: string) => void
}) {
  return (
    <div className="history-controls">
      <label>Search listings
        <input value={search} onChange={(event) => onSearch(event.target.value)} placeholder="Search title or pickup location" />
      </label>
      <label>Availability
        <select value={availability} onChange={(event) => onAvailability(event.target.value)}>
          <option value="">All</option><option value="true">Available</option><option value="false">Unavailable</option><option value="expired">Expired</option>
        </select>
      </label>
      <label>Sort by
        <select value={sort} onChange={(event) => onSort(event.target.value)}>
          <option value="newest">Newest</option><option value="oldest">Oldest</option><option value="expiry">Expiry</option>
        </select>
      </label>
    </div>
  )
}

function HistoryPagination({
  data,
  onOffset,
}: {
  data: PageResult<unknown> | null
  onOffset: (offset: number) => void
}) {
  if (!data || data.total <= data.limit) return null
  return (
    <nav className="history-pagination" aria-label="Listing history pages">
      <button className="button button-secondary" disabled={data.offset === 0} onClick={() => onOffset(Math.max(0, data.offset - data.limit))}>Previous</button>
      <span>{data.offset + 1}–{Math.min(data.offset + data.limit, data.total)} of {data.total}</span>
      <button className="button button-secondary" disabled={data.offset + data.limit >= data.total} onClick={() => onOffset(data.offset + data.limit)}>Next</button>
    </nav>
  )
}

export function RestaurantDashboard() {
  const { currentUser, token } = useAppContext()
  const [stats, setStats] = useState<RestaurantAnalytics | null>(null)
  const [statsError, setStatsError] = useState('')

  useEffect(() => {
    let active = true
    const timer = window.setTimeout(() => {
      void apiRequest<RestaurantAnalytics>('/restaurant/analytics', {}, token).then((result) => {
        if (active) setStats(result)
      }).catch((reason: unknown) => {
        if (active) setStatsError(reason instanceof Error ? reason.message : 'Unable to load restaurant analytics.')
      })
    }, 0)
    return () => {
      active = false
      window.clearTimeout(timer)
    }
  }, [token])

  return (
    <>
      <PageHeader eyebrow="Restaurant workspace" title={`Welcome, ${currentUser?.full_name.split(' ')[0] ?? 'Restaurant'}`} description="Publish surplus meals and discounted Flash Deals." />
      {statsError ? <ErrorState message={statsError} /> : null}
      <div className="dashboard-overview-grid">
        <div className="quick-action-grid dashboard-center-actions">
          <Link to="/restaurant/donations/create"><strong>Create a donation</strong><span>Share surplus food with local NGOs.</span></Link>
          <Link to="/restaurant/stock-clearance/create"><strong>Publish a Flash Deal</strong><span>Offer leftover meals at a backend-calculated discount.</span></Link>
          <Link to="/restaurant/donations"><strong>Browse food listings</strong><span>See currently available food listings.</span></Link>
          <Link to="/restaurant/stock-clearance"><strong>Browse Flash Deals</strong><span>See currently available discounted offers.</span></Link>
        </div>
        <div className="dashboard-stat-grid dashboard-side-stats">
          <article className="dashboard-stat"><span className="dashboard-stat-icon"><PackagePlus aria-hidden="true" /></span><strong>{stats?.donations_posted ?? '—'}</strong><span>Donations posted</span></article>
          <article className="dashboard-stat"><span className="dashboard-stat-icon"><HandHeart aria-hidden="true" /></span><strong>{stats?.food_claims ?? '—'}</strong><span>Food claims</span></article>
          <article className="dashboard-stat"><span className="dashboard-stat-icon"><Truck aria-hidden="true" /></span><strong>{stats?.deliveries_completed ?? '—'}</strong><span>Deliveries completed</span></article>
        </div>
      </div>
    </>
  )
}

export function CreateDonationPage() {
  const { donation, setDonation, donationBusy, donationError, donationMessage, handleCreateDonation } = useAppContext()
  return (
    <>
      <PageHeader eyebrow="Restaurant · Donations" title="Create food donation" description="Share a surplus listing with NGOs. This form sends to POST /food-listings." />
      <section className="dashboard-panel">
        {donationMessage ? <p className="route-success" role="status">{donationMessage}</p> : null}
        {donationError ? <ErrorState message={donationError} /> : null}
        <form className="form-grid" onSubmit={handleCreateDonation}>
          <label>Food title *
            <input required minLength={2} maxLength={150} value={donation.title} onChange={(e) => setDonation({ ...donation, title: e.target.value })} placeholder="e.g. Fresh vegetable meals" />
          </label>
          <label>Food type *
            <select value={donation.source_type} onChange={(e) => setDonation({ ...donation, source_type: e.target.value })}>
              <option value="restaurant">Restaurant food</option><option value="event">Event surplus</option>
            </select>
          </label>
          <label className="form-span-all">Description
            <textarea rows={3} maxLength={2000} value={donation.description} onChange={(e) => setDonation({ ...donation, description: e.target.value })} placeholder="Describe the food and its condition" />
          </label>
          <label>Quantity *
            <input required type="number" min="1" max="100000" step="1" value={donation.quantity} onChange={(e) => setDonation({ ...donation, quantity: e.target.value })} />
          </label>
          <label>Unit *
            <select value={donation.unit} onChange={(e) => setDonation({ ...donation, unit: e.target.value })}>
              {['meals', 'kg', 'packets', 'boxes', 'litres'].map((unit) => <option value={unit} key={unit}>{unit}</option>)}
            </select>
          </label>
          <label>Price per unit (₹; enter 0 for free)
            <input required type="number" min="0" step="0.01" value={donation.price_rupees} onChange={(e) => setDonation({ ...donation, price_rupees: e.target.value })} />
          </label>
          <label>Pickup location *
            <input required minLength={3} maxLength={255} value={donation.pickup_location} onChange={(e) => setDonation({ ...donation, pickup_location: e.target.value })} placeholder="Restaurant address" />
          </label>
          <label className="form-span-all">Food expiry *
            <input required type="datetime-local" value={donation.expires_at} onChange={(e) => setDonation({ ...donation, expires_at: e.target.value })} />
          </label>
          <button type="submit" className="button button-primary form-span-all" disabled={donationBusy}>{donationBusy ? 'Submitting...' : 'Publish donation'}</button>
        </form>
      </section>
    </>
  )
}

export function MyDonationsPage() {
  const [search, setSearch] = useState('')
  const [availability, setAvailability] = useState('')
  const [sort, setSort] = useState('newest')
  const [offset, setOffset] = useState(0)
  const query = new URLSearchParams({ limit: '25', offset: String(offset), sort })
  if (search.trim()) query.set('search', search.trim())
  if (availability === 'expired') query.set('expired', 'true')
  else if (availability) query.set('available', availability)
  const { data, loading, error, refresh } = useRestaurantHistory<FoodListingHistory>(`/restaurant/donations?${query}`)
  return (
    <>
      <PageHeader eyebrow="Restaurant · Listings" title="Available food listings" description="Your donation listings, availability, expiry, and claims." action={<button className="button button-secondary" onClick={refresh}>Refresh</button>} />
      <HistoryControls search={search} onSearch={(value) => { setSearch(value); setOffset(0) }} availability={availability} onAvailability={(value) => { setAvailability(value); setOffset(0) }} sort={sort} onSort={(value) => { setSort(value); setOffset(0) }} />
      {loading ? <LoadingState label="Loading available food..." /> : null}
      {error ? <ErrorState message={error} /> : null}
      {!loading && !error && !data?.items.length ? <EmptyState>No currently available donations.</EmptyState> : null}
      <div className="dashboard-card-grid">
        {!loading && !error ? data?.items.map((listing) => (
          <article className="dashboard-panel compact-listing" key={listing.id}>
            <span className={`food-category ${listingStatus(listing.is_available, listing.expires_at) === 'Available' ? 'status-available' : 'status-unavailable'}`}>{listingStatus(listing.is_available, listing.expires_at)}</span>
            <h2>{listing.title}</h2><p>{listing.description || 'No description provided.'}</p>
            <dl><div><dt>Quantity</dt><dd>{listing.quantity} {listing.unit}</dd></div><div><dt>Pickup</dt><dd>{listing.pickup_location}</dd></div><div><dt>Expiry</dt><dd>{new Date(listing.expires_at).toLocaleString()}</dd></div></dl>
            <h3>Claims</h3>
            {listing.claims.length ? listing.claims.map((claim) => <p key={claim.id}>Claim #{claim.id} · {claim.status}</p>) : <p>No claims.</p>}
            {listing.is_available && listingStatus(listing.is_available, listing.expires_at) === 'Available' && !listing.claims.length
              ? <EditListingForm path={`/restaurant/donations/${listing.id}`} listing={listing} onSaved={refresh} />
              : null}
            {listing.is_available && listingStatus(listing.is_available, listing.expires_at) === 'Available' ? <CancelListingButton path={`/restaurant/donations/${listing.id}`} onCancelled={refresh} /> : null}
          </article>
        )) : null}
      </div>
      <HistoryPagination data={data} onOffset={setOffset} />
    </>
  )
}

export function CreateStockOfferPage() {
  const { stockOffer, setStockOffer, stockBusy, stockError, stockMessage, handleCreateStockOffer } = useAppContext()
  return (
    <>
      <PageHeader eyebrow="Restaurant · Flash Deals" title="Create discounted offer" description="Publish an eligible leftover meal. Discount amount and price are calculated by the backend." />
      <section className="dashboard-panel">
        {stockMessage ? <p className="route-success" role="status">{stockMessage}</p> : null}
        {stockError ? <ErrorState message={stockError} /> : null}
        <form className="form-grid" onSubmit={handleCreateStockOffer}>
          <label>Food title *
            <input required minLength={2} maxLength={150} value={stockOffer.title} onChange={(e) => setStockOffer({ ...stockOffer, title: e.target.value })} placeholder="e.g. Fresh paneer meals" />
          </label>
          <label>Quantity *
            <input required type="number" min="1" max="100000" value={stockOffer.quantity} onChange={(e) => setStockOffer({ ...stockOffer, quantity: e.target.value })} />
          </label>
          <label>Unit *
            <select value={stockOffer.unit} onChange={(e) => setStockOffer({ ...stockOffer, unit: e.target.value })}>
              {['meals', 'packets', 'boxes', 'kg'].map((unit) => <option key={unit}>{unit}</option>)}
            </select>
          </label>
          <label>Original price per unit (₹) *
            <input required type="number" min="0.01" step="0.01" value={stockOffer.original_price_rupees} onChange={(e) => setStockOffer({ ...stockOffer, original_price_rupees: e.target.value })} />
          </label>
          <label className="form-span-all">Description
            <textarea rows={2} maxLength={2000} value={stockOffer.description} onChange={(e) => setStockOffer({ ...stockOffer, description: e.target.value })} />
          </label>
          <label>Pickup location *
            <input required minLength={3} maxLength={255} value={stockOffer.pickup_location} onChange={(e) => setStockOffer({ ...stockOffer, pickup_location: e.target.value })} placeholder="Restaurant address" />
          </label>
          <label>Food expiry *
            <input required type="datetime-local" value={stockOffer.expires_at} onChange={(e) => setStockOffer({ ...stockOffer, expires_at: e.target.value })} />
          </label>
          <button type="submit" className="button button-primary form-span-all" disabled={stockBusy}>{stockBusy ? 'Publishing...' : 'Publish Flash Deal'}</button>
        </form>
      </section>
    </>
  )
}

export function MyStockOffersPage() {
  const [search, setSearch] = useState('')
  const [availability, setAvailability] = useState('')
  const [sort, setSort] = useState('newest')
  const [offset, setOffset] = useState(0)
  const query = new URLSearchParams({ limit: '25', offset: String(offset), sort })
  if (search.trim()) query.set('search', search.trim())
  if (availability === 'expired') query.set('expired', 'true')
  else if (availability) query.set('available', availability)
  const offers = useRestaurantHistory<StockClearanceListing>(`/restaurant/stock-clearance?${query}`)
  const claims = useRestaurantHistory<StockClearanceClaim>(`/restaurant/stock-clearance-claims?limit=25&offset=${offset}`)
  return (
    <>
      <PageHeader eyebrow="Restaurant · Flash Deals" title="Available Flash Deals" description="Your Stock Clearance offers, availability, expiry, and claims." action={<button className="button button-secondary" onClick={() => { offers.refresh(); claims.refresh() }}>Refresh</button>} />
      <HistoryControls search={search} onSearch={(value) => { setSearch(value); setOffset(0) }} availability={availability} onAvailability={(value) => { setAvailability(value); setOffset(0) }} sort={sort} onSort={(value) => { setSort(value); setOffset(0) }} />
      {offers.loading ? <LoadingState label="Loading offers..." /> : null}
      {offers.error ? <ErrorState message={offers.error} /> : null}
      {!offers.loading && !offers.error && !offers.data?.items.length ? <EmptyState>No available Flash Deals.</EmptyState> : null}
      <div className="dashboard-card-grid">
        {!offers.loading && !offers.error ? offers.data?.items.map((offer) => (
          <article className="dashboard-panel compact-listing" key={offer.id}>
            <span className={`food-category ${listingStatus(offer.is_available, offer.expires_at) === 'Available' ? 'status-available' : 'status-unavailable'}`}>{listingStatus(offer.is_available, offer.expires_at)} · {offer.discount_percent}% discount</span>
            <h2>{offer.title}</h2><p>{offer.description || 'No description provided.'}</p>
            <dl><div><dt>Remaining</dt><dd>{offer.quantity} {offer.unit}</dd></div><div><dt>Pickup</dt><dd>{offer.pickup_location}</dd></div><div><dt>Expiry</dt><dd>{new Date(offer.expires_at).toLocaleString()}</dd></div></dl>
            <p className="food-price">₹{(offer.discounted_price_paise / 100).toFixed(2)} per unit</p>
            {offer.is_available && listingStatus(offer.is_available, offer.expires_at) === 'Available'
              ? <EditListingForm path={`/restaurant/stock-clearance/${offer.id}`} listing={offer} onSaved={offers.refresh} />
              : null}
            {offer.is_available && listingStatus(offer.is_available, offer.expires_at) === 'Available' ? <CancelListingButton path={`/restaurant/stock-clearance/${offer.id}`} onCancelled={offers.refresh} /> : null}
          </article>
        )) : null}
      </div>
      <HistoryPagination data={offers.data} onOffset={setOffset} />
      <section className="restaurant-claim-history">
        <h2>Stock Clearance claims</h2>
        {claims.loading ? <LoadingState /> : null}
        {claims.error ? <ErrorState message={claims.error} /> : null}
        {!claims.loading && !claims.error && !claims.data?.items.length ? <EmptyState>No claims.</EmptyState> : null}
        {claims.data?.items.length ? <div className="admin-table-scroll"><table className="admin-table"><thead><tr><th>Offer</th><th>Customer</th><th>Quantity</th><th>Discount</th><th>Claimed</th></tr></thead><tbody>
          {claims.data.items.map((claim) => <tr key={claim.id}><td>{claim.listing_id}</td><td>{claim.customer_id}</td><td>{claim.quantity}</td><td>{claim.discount_percent}%</td><td>{new Date(claim.claimed_at).toLocaleString()}</td></tr>)}
        </tbody></table></div> : null}
        <HistoryPagination data={claims.data} onOffset={setOffset} />
      </section>
    </>
  )
}
