import { useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight, Clock3, MapPin, PackageCheck, ReceiptText, Tags, UtensilsCrossed } from 'lucide-react'
import { EmptyState, ErrorState, LoadingState, PageHeader } from '../components/PagePrimitives'
import { FoodListingCard } from '../components/FoodListingCard'
import { ResultsPagination } from '../components/ResultsPagination'
import { useAppContext } from '../context/AppContext'
import { usePagedResource } from '../hooks/usePagedResource'
import type { FoodListing, StockClearanceClaim, StockClearanceListing } from '../types'

function BrowseControls({
  search,
  onSearch,
  sort,
  onSort,
  sourceType,
  onSourceType,
}: {
  search: string
  onSearch: (value: string) => void
  sort: string
  onSort: (value: string) => void
  sourceType?: string
  onSourceType?: (value: string) => void
}) {
  return (
    <div className="history-controls">
      <label>Search listings
        <input value={search} onChange={(event) => onSearch(event.target.value)} placeholder="Search title, description, or location" />
      </label>
      {onSourceType ? <label>Food type
        <select value={sourceType} onChange={(event) => onSourceType(event.target.value)}>
          <option value="">All types</option><option value="restaurant">Restaurant</option><option value="event">Event</option>
        </select>
      </label> : null}
      <label>Sort by
        <select value={sort} onChange={(event) => onSort(event.target.value)}>
          <option value="newest">Newest</option><option value="expiry">Expiry</option><option value="title">Title</option>
        </select>
      </label>
    </div>
  )
}

export function UserDashboard() {
  const { currentUser, stockListings, stockClaims, listings } = useAppContext()
  return (
    <>
      <PageHeader eyebrow="Community workspace" title={`Welcome, ${currentUser?.full_name.split(' ')[0] ?? 'there'}`} description="Browse local food and claim discounted Flash Deals." />
      <div className="dashboard-overview-grid">
        <div className="quick-action-grid dashboard-center-actions">
          <Link to="/user/food"><strong>Browse available food</strong><span>See currently available community donations.</span></Link>
          <Link to="/user/flash-deals"><strong>Browse Flash Deals</strong><span>Claim discounted restaurant meals.</span></Link>
          <Link to="/user/flash-deals/my-claims"><strong>View my claims</strong><span>Review your private Flash Deal claim history.</span></Link>
        </div>
        <div className="dashboard-stat-grid dashboard-side-stats">
          <article className="dashboard-stat"><span className="dashboard-stat-icon"><UtensilsCrossed aria-hidden="true" /></span><strong>{listings.length}</strong><span>Available food listings</span></article>
          <article className="dashboard-stat"><span className="dashboard-stat-icon"><Tags aria-hidden="true" /></span><strong>{stockListings.length}</strong><span>Current Flash Deals</span></article>
          <article className="dashboard-stat"><span className="dashboard-stat-icon"><ReceiptText aria-hidden="true" /></span><strong>{stockClaims.length}</strong><span>Your deal claims</span></article>
        </div>
      </div>
    </>
  )
}

export function AvailableFoodPage() {
  const [search, setSearch] = useState('')
  const [sourceType, setSourceType] = useState('')
  const [sort, setSort] = useState('newest')
  const [offset, setOffset] = useState(0)
  const query = new URLSearchParams({ limit: '25', offset: String(offset), sort })
  if (search.trim()) query.set('search', search.trim())
  if (sourceType) query.set('source_type', sourceType)
  const { data, loading, error, reload } = usePagedResource<FoodListing>(`/food-listings/search?${query}`)
  return (
    <>
      <PageHeader eyebrow="Community · Food listings" title="Available food" description="Browse live donations. Bulk donation claims are reserved for NGO accounts." action={<button className="button button-secondary" onClick={() => void reload()}>Refresh</button>} />
      <BrowseControls search={search} onSearch={(value) => { setSearch(value); setOffset(0) }} sourceType={sourceType} onSourceType={(value) => { setSourceType(value); setOffset(0) }} sort={sort} onSort={(value) => { setSort(value); setOffset(0) }} />
      {loading ? <LoadingState label="Loading available food..." /> : null}
      {error ? <ErrorState message={error} /> : null}
      {!loading && !error && !data?.items.length ? <EmptyState>No food listings are currently available.</EmptyState> : null}
      {!loading && !error ? <div className="food-listing-grid">{data?.items.map((listing) => <FoodListingCard key={listing.id} listing={listing} />)}</div> : null}
      <ResultsPagination data={data} onOffsetChange={setOffset} />
    </>
  )
}

export function FlashDealsPage() {
  const {
    stockMessage,
    stockClaimBusy,
    stockClaimQuantities,
    setStockClaimQuantities,
    handleClaimStockOffer,
  } = useAppContext()
  const [search, setSearch] = useState('')
  const [sort, setSort] = useState('newest')
  const [offset, setOffset] = useState(0)
  const query = new URLSearchParams({ limit: '25', offset: String(offset), sort })
  if (search.trim()) query.set('search', search.trim())
  const { data, loading, error, reload } = usePagedResource<StockClearanceListing>(`/stock-clearance/search?${query}`)
  const stockListings = data?.items ?? []
  async function claimOffer(listingId: number) {
    await handleClaimStockOffer(listingId)
    await reload()
  }
  return (
    <>
      <PageHeader eyebrow="Community · Discounted meals" title="Flash Deals" description="Discount values and prices come from the backend. Claim quantities refresh after a successful claim." action={<button type="button" className="button button-secondary" onClick={() => void reload()}>Refresh deals</button>} />
      <BrowseControls search={search} onSearch={(value) => { setSearch(value); setOffset(0) }} sort={sort} onSort={(value) => { setSort(value); setOffset(0) }} />
      {stockMessage ? <p className="route-success" role="status">{stockMessage}</p> : null}
      {loading ? <LoadingState label="Loading Flash Deals..." /> : null}
      {error ? <ErrorState message={error} /> : null}
      {!loading && !error && stockListings.length === 0 ? <EmptyState>No discounted meals are available right now.</EmptyState> : null}
      {!loading && !error ? (
        <div className="food-listing-grid flash-deal-grid">
          {stockListings.map((offer) => (
            <article className="flash-deal-card" key={offer.id}>
              <span className="flash-deal-badge">{offer.discount_percent}% OFF</span>
              <h2>{offer.title}</h2>
              <p>{offer.description || 'No description provided.'}</p>
              <div className="flash-price-row">
                <span>₹{(offer.discounted_price_paise / 100).toFixed(2)}<small> per unit</small></span>
                <del>₹{(offer.original_price_paise / 100).toFixed(2)}</del>
              </div>
              <div className="food-details-grid">
                <p><PackageCheck aria-hidden="true" size={16} /><span><strong>{offer.quantity} {offer.unit}</strong><small>Remaining</small></span></p>
                <p><MapPin aria-hidden="true" size={16} /><span><strong>{offer.pickup_location}</strong><small>Pickup location</small></span></p>
                <p><Clock3 aria-hidden="true" size={16} /><span><strong>{new Date(offer.expires_at).toLocaleString()}</strong><small>Food expiry</small></span></p>
              </div>
              <div className="flash-claim-row">
                <label htmlFor={`claim-quantity-${offer.id}`}>Quantity
                  <input id={`claim-quantity-${offer.id}`} type="number" min="1" max={offer.quantity} step="1" value={stockClaimQuantities[offer.id] ?? '1'} onChange={(e) => setStockClaimQuantities({ ...stockClaimQuantities, [offer.id]: e.target.value })} />
                </label>
                <button type="button" className="button button-primary" disabled={stockClaimBusy === offer.id} onClick={() => void claimOffer(offer.id)}>
                  {stockClaimBusy === offer.id ? 'Claiming...' : 'Claim deal'}<ArrowRight aria-hidden="true" size={16} />
                </button>
              </div>
            </article>
          ))}
        </div>
      ) : null}
      <ResultsPagination data={data} onOffsetChange={setOffset} />
    </>
  )
}

export function MyFlashDealClaimsPage() {
  const [search, setSearch] = useState('')
  const [sort, setSort] = useState('newest')
  const [offset, setOffset] = useState(0)
  const query = new URLSearchParams({ limit: '25', offset: String(offset), sort })
  if (search.trim()) query.set('search', search.trim())
  const { data, loading, error, reload } = usePagedResource<StockClearanceClaim>(`/stock-clearance/my-claims/search?${query}`)
  const stockClaims = data?.items ?? []
  return (
    <>
      <PageHeader eyebrow="Community · Private history" title="My Flash Deal claims" description="Loaded from your authenticated account." action={<button type="button" className="button button-secondary" onClick={() => void reload()}>Refresh</button>} />
      <div className="history-controls">
        <label>Search offers<input value={search} onChange={(event) => { setSearch(event.target.value); setOffset(0) }} placeholder="Search offers" /></label>
        <label>Sort by<select value={sort} onChange={(event) => { setSort(event.target.value); setOffset(0) }}><option value="newest">Newest</option><option value="oldest">Oldest</option></select></label>
      </div>
      {loading ? <LoadingState label="Loading your claims..." /> : null}
      {error ? <ErrorState message={error} /> : null}
      {!loading && !error && stockClaims.length === 0 ? <EmptyState>You have not claimed a discounted meal yet.</EmptyState> : null}
      <div className="dashboard-card-grid">
        {!loading && !error ? stockClaims.map((claim) => (
          <article className="dashboard-panel compact-listing" key={claim.id}>
            <span className="food-category">{claim.discount_percent}% discount applied</span>
            <h2>Offer #{claim.listing_id}</h2>
            <dl><div><dt>Quantity</dt><dd>{claim.quantity}</dd></div><div><dt>Final unit price</dt><dd>₹{(claim.unit_price_paise / 100).toFixed(2)}</dd></div><div><dt>Claimed</dt><dd>{new Date(claim.claimed_at).toLocaleString()}</dd></div></dl>
          </article>
        )) : null}
      </div>
      <ResultsPagination data={data} onOffsetChange={setOffset} />
    </>
  )
}
