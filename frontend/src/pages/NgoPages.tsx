import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { FoodListingCard } from '../components/FoodListingCard'
import { DonationTracking } from '../components/DonationTracking'
import { EmptyState, ErrorState, LoadingState, PageHeader } from '../components/PagePrimitives'
import { ResultsPagination } from '../components/ResultsPagination'
import { useAppContext } from '../context/AppContext'
import { usePagedResource } from '../hooks/usePagedResource'
import type { FoodClaim, FoodListing } from '../types'

type PieSegment = { label: string; value: number; color: string }

function PieStat({ title, segments }: { title: string; segments: PieSegment[] }) {
  const total = segments.reduce((sum, segment) => sum + segment.value, 0)
  const gradient = segments
    .filter((segment) => segment.value > 0)
    .reduce<{ stops: string[]; percentage: number }>((result, segment) => {
      const nextPercentage = result.percentage + (segment.value / total) * 100
      return {
        stops: [...result.stops, `${segment.color} ${result.percentage}% ${nextPercentage}%`],
        percentage: nextPercentage,
      }
    }, { stops: [], percentage: 0 })
    .stops.join(', ')

  return (
    <article className="ngo-analytics-card">
      <h2>{title}</h2>
      {total > 0 ? (
        <>
          <div className="ngo-pie-chart" role="img" aria-label={`${title}: ${segments.filter((segment) => segment.value > 0).map((segment) => `${segment.label}, ${segment.value}`).join('; ')}`} style={{ background: `conic-gradient(${gradient})` }} />
          <ul className="ngo-pie-legend">
            {segments.filter((segment) => segment.value > 0).map((segment) => (
              <li key={segment.label}><span style={{ backgroundColor: segment.color }} />{segment.label}<strong>{segment.value}</strong></li>
            ))}
          </ul>
        </>
      ) : <p className="ngo-chart-empty">No data available.</p>}
    </article>
  )
}

export function NgoDashboard() {
  const { currentUser, ngoClaims, listings, stats } = useAppContext()
  const claimStatuses = useMemo(() => {
    const counts = new Map<string, number>()
    for (const claim of ngoClaims) counts.set(claim.status, (counts.get(claim.status) ?? 0) + 1)
    const colors: Record<string, string> = { claimed: '#3279A5', collected: '#83B6D1', delivered: '#E6C77F' }
    return [...counts].map(([label, value], index) => ({
      label,
      value,
      color: colors[label] ?? ['#3279A5', '#83B6D1', '#E6C77F'][index % 3],
    }))
  }, [ngoClaims])
  const availableOther = Math.max(stats.total_donations - listings.length, 0)
  const incompleteDeliveries = Math.max(stats.total_claims - stats.total_deliveries, 0)
  return (
    <>
      <PageHeader eyebrow="NGO workspace" title={`Welcome, ${currentUser?.full_name.split(' ')[0] ?? 'NGO'}`} description="Browse available food, manage your claims, and follow delivery progress." />
      <div className="ngo-analytics-grid">
        <PieStat title="Available listings" segments={[
          { label: 'Available', value: listings.length, color: '#174C35' },
          { label: 'Not currently available', value: availableOther, color: '#8DB99A' },
        ]} />
        <PieStat title="Your claims" segments={claimStatuses} />
        <PieStat title="Completed deliveries (all users)" segments={[
          { label: 'Completed', value: stats.total_deliveries, color: '#176B4B' },
          { label: 'Not completed', value: incompleteDeliveries, color: '#D5E7D8' },
        ]} />
      </div>
      <div className="quick-action-grid dashboard-center-actions ngo-center-actions">
        <Link to="/ngo/donations"><strong>Browse donations</strong><span>Find available bulk food and claim a listing.</span></Link>
        <Link to="/ngo/claims"><strong>Manage claimed food</strong><span>Review claim and delivery status.</span></Link>
      </div>
    </>
  )
}

export function AvailableDonationsPage() {
  const { claimMessage, claimError } = useAppContext()
  const [search, setSearch] = useState('')
  const [sort, setSort] = useState('newest')
  const [offset, setOffset] = useState(0)
  const query = new URLSearchParams({ limit: '25', offset: String(offset), sort })
  if (search.trim()) query.set('search', search.trim())
  const { data, loading, error, reload } = usePagedResource<FoodListing>(`/food-listings/search?${query}`)
  return (
    <>
      <PageHeader eyebrow="NGO · Food listings" title="Available donations" description="Claim eligible bulk food donations for your organization." action={<button type="button" className="button button-secondary" onClick={() => void reload()}>Refresh</button>} />
      <div className="history-controls">
        <label>Search listings<input value={search} onChange={(event) => { setSearch(event.target.value); setOffset(0) }} placeholder="Search title, description, or location" /></label>
        <label>Sort by<select value={sort} onChange={(event) => { setSort(event.target.value); setOffset(0) }}><option value="newest">Newest</option><option value="expiry">Expiry</option><option value="title">Title</option></select></label>
      </div>
      {claimMessage ? <p className="route-success" role="status">{claimMessage}</p> : null}
      {loading ? <LoadingState label="Loading available donations..." /> : null}
      {error ? <ErrorState message={error} /> : null}
      {claimError ? <ErrorState message={claimError} /> : null}
      {!loading && !error && !data?.items.length ? <EmptyState>No food donations are currently available.</EmptyState> : null}
      {!loading && !error ? <div className="food-listing-grid">{data?.items.map((listing) => <FoodListingCard key={listing.id} listing={listing} canClaim onClaimed={reload} />)}</div> : null}
      <ResultsPagination data={data} onOffsetChange={setOffset} />
    </>
  )
}

export function NgoClaimsPage() {
  const { claimError, claimMessage } = useAppContext()
  const [status, setStatus] = useState('')
  const [offset, setOffset] = useState(0)
  const query = new URLSearchParams({ limit: '25', offset: String(offset) })
  if (status) query.set('status_filter', status)
  const { data, loading, error, reload } = usePagedResource<FoodClaim>(`/ngo/claims/search?${query}`)
  const ngoClaims = data?.items ?? []
  return (
    <>
      <PageHeader eyebrow="NGO · Claim history" title="My claimed donations" description="Claims are private to your authenticated NGO account." action={<button type="button" className="button button-secondary" onClick={() => void reload()}>Refresh claims</button>} />
      <label className="admin-filter-label">Status<select value={status} onChange={(event) => { setStatus(event.target.value); setOffset(0) }}><option value="">All statuses</option>{['claimed', 'collected', 'delivered'].map((value) => <option key={value}>{value}</option>)}</select></label>
      {claimMessage ? <p className="route-success" role="status">{claimMessage}</p> : null}
      {loading ? <LoadingState label="Loading claims..." /> : null}
      {error ? <ErrorState message={error} /> : null}
      {claimError ? <ErrorState message={claimError} /> : null}
      {ngoClaims.length === 0 && !claimError && !error && !loading ? <EmptyState>You have not claimed any food yet.</EmptyState> : null}
      <div className="dashboard-card-grid">
        {ngoClaims.map((claim) => (
          <article className="dashboard-panel compact-listing" key={claim.id}>
            <span className={`food-category status-badge status-${claim.status}`}>{claim.status}</span>
            <h2>Food listing #{claim.listing_id}</h2>
            <dl><div><dt>Claim ID</dt><dd>{claim.id}</dd></div><div><dt>Claimed</dt><dd>{new Date(claim.claimed_at).toLocaleString()}</dd></div><div><dt>Volunteer</dt><dd>{claim.volunteer_id ?? 'Not assigned'}</dd></div></dl>
            <DonationTracking claim={claim} />
            {claim.collected_at ? <p>Collected {new Date(claim.collected_at).toLocaleString()}</p> : null}
            {claim.delivered_at ? <p>Delivered {new Date(claim.delivered_at).toLocaleString()}</p> : null}
          </article>
        ))}
      </div>
      <ResultsPagination data={data} onOffsetChange={setOffset} />
    </>
  )
}
