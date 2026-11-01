import { useCallback, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Check, Search, ShieldCheck, X } from 'lucide-react'
import { LocationMapPreview } from '../components/DeliveryMap'
import { EmptyState, ErrorState, LoadingState, PageHeader } from '../components/PagePrimitives'
import { useAppContext } from '../context/AppContext'
import { apiRequest } from '../services/api'
import type {
  AdminAuditLog,
  AdminUser,
  FoodClaim,
  FoodListing,
  PageResult,
  StockClearanceClaim,
  StockClearanceListing,
} from '../types'

type Resource<T> = {
  data: T | null
  loading: boolean
  error: string
  reload: () => Promise<void>
}

type AdminMapLocation = {
  listing_id: number
  claim_id: number | null
  title: string
  status: string
  pickup: { address: string; latitude: number; longitude: number }
  delivery: { address: string; latitude: number; longitude: number } | null
  volunteer: { latitude: number; longitude: number; updated_at: string | null } | null
}

function useAdminResource<T>(path: string): Resource<T> {
  const { token } = useAppContext()
  const [data, setData] = useState<T | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [revision, setRevision] = useState(0)
  const reload = useCallback(async () => setRevision((value) => value + 1), [])

  useEffect(() => {
    let active = true
    const timer = window.setTimeout(() => {
      setLoading(true)
      setError('')
      void apiRequest<T>(path, {}, token).then((result) => {
        if (active) setData(result)
      }).catch((reason: unknown) => {
        if (active) setError(reason instanceof Error ? reason.message : 'Unable to load administrative data.')
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

function AdminPageState({ loading, error, empty }: { loading: boolean; error: string; empty: boolean }) {
  return (
    <>
      {loading ? <LoadingState /> : null}
      {error ? <ErrorState message={error} /> : null}
      {!loading && !error && empty ? <EmptyState>No records found.</EmptyState> : null}
    </>
  )
}

function AdminPagination({ data, onOffset }: { data: PageResult<unknown> | null; onOffset: (offset: number) => void }) {
  if (!data || data.total <= data.limit) return null
  return (
    <nav className="history-pagination" aria-label="Administrative results pages">
      <button className="button button-secondary" disabled={!data.offset} onClick={() => onOffset(Math.max(0, data.offset - data.limit))}>Previous</button>
      <span>{data.offset + 1}–{Math.min(data.offset + data.limit, data.total)} of {data.total}</span>
      <button className="button button-secondary" disabled={data.offset + data.limit >= data.total} onClick={() => onOffset(data.offset + data.limit)}>Next</button>
    </nav>
  )
}

function AdminTable({ children }: { children: React.ReactNode }) {
  return <div className="admin-table-scroll"><table className="admin-table">{children}</table></div>
}

function useAdminMutation() {
  const { token } = useAppContext()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const mutate = useCallback(async <T,>(path: string, method: 'PATCH' | 'POST', body?: object): Promise<T | null> => {
    setBusy(true)
    setError('')
    try {
      return await apiRequest<T>(path, {
        method,
        ...(body ? { body: JSON.stringify(body) } : {}),
      }, token)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Administrative action failed.')
      return null
    } finally {
      setBusy(false)
    }
  }, [token])
  return { busy, error, mutate }
}

export function AdminDashboard() {
  const { data, loading, error } = useAdminResource<Record<string, number>>('/admin/analytics')
  const metrics = [
    ['Users', data?.users],
    ['Active users', data?.active_users],
    ['Pending approval', data?.pending_approval],
    ['Restaurants', data?.restaurants],
    ['NGOs', data?.ngos],
    ['Volunteers', data?.volunteers],
    ['Community users', data?.community_users],
    ['Food listings', data?.food_listings],
    ['Available food listings', data?.available_food_listings],
    ['Food claims', data?.food_claims],
    ['Pending claims', data?.pending_claims],
    ['Deliveries completed', data?.deliveries_completed],
    ['Stock Clearance listings', data?.stock_clearance_listings],
    ['Active Stock Clearance offers', data?.active_stock_clearance_offers],
    ['Stock Clearance claims', data?.stock_clearance_claims],
    ['Expired food listings', data?.expired_food_listings],
    ['Expired Stock Clearance offers', data?.expired_stock_clearance_offers],
  ] as const
  return (
    <>
      <PageHeader eyebrow="Admin workspace" title="Admin Dashboard" description="Platform overview from current database records." />
      {loading ? <LoadingState /> : null}
      {error ? <ErrorState message={error} /> : null}
      <div className="admin-metric-grid">
        {metrics.map(([label, value]) => (
          <article className="dashboard-stat" key={label}>
            <span className="dashboard-stat-icon"><ShieldCheck aria-hidden="true" /></span>
            <strong>{value ?? '—'}</strong><span>{label}</span>
          </article>
        ))}
      </div>
    </>
  )
}

export function AdminUsersPage() {
  const [search, setSearch] = useState('')
  const [role, setRole] = useState('')
  const [active, setActive] = useState('')
  const [verified, setVerified] = useState('')
  const [sort, setSort] = useState('newest')
  const [offset, setOffset] = useState(0)
  const query = new URLSearchParams({ limit: '25', offset: String(offset), sort })
  if (search.trim()) query.set('search', search.trim())
  if (role) query.set('role', role)
  if (active) query.set('active', active)
  if (verified) query.set('verified', verified)
  const { data, loading, error, reload } = useAdminResource<PageResult<AdminUser>>(`/admin/users?${query}`)
  const { busy, error: mutationError, mutate } = useAdminMutation()
  const update = async (id: number, body: { is_active?: boolean; is_verified?: boolean; reason?: string }) => {
    if (await mutate<AdminUser>(`/admin/users/${id}`, 'PATCH', body)) await reload()
  }
  const reject = async (id: number) => {
    const reason = window.prompt('Reason for rejection')
    if (reason === null) return
    await update(id, { is_active: false, is_verified: false, reason })
  }
  return (
    <>
      <PageHeader eyebrow="Admin · Accounts" title="Users" description="Search accounts and review their role and status." />
      <label className="admin-search"><Search aria-hidden="true" size={17} /><input value={search} onChange={(event) => { setSearch(event.target.value); setOffset(0) }} placeholder="Search name or email" /></label>
      <div className="admin-filter-row">
        <label>Role<select value={role} onChange={(event) => { setRole(event.target.value); setOffset(0) }}><option value="">All roles</option>{['user', 'restaurant', 'ngo', 'agent', 'school', 'admin'].map((value) => <option key={value}>{value}</option>)}</select></label>
        <label>Account status<select value={active} onChange={(event) => { setActive(event.target.value); setOffset(0) }}><option value="">All statuses</option><option value="true">Active</option><option value="false">Inactive</option></select></label>
        <label>Approval status<select value={verified} onChange={(event) => { setVerified(event.target.value); setOffset(0) }}><option value="">All approvals</option><option value="false">Pending</option><option value="true">Verified</option></select></label>
        <label>Sort by<select value={sort} onChange={(event) => { setSort(event.target.value); setOffset(0) }}><option value="newest">Newest</option><option value="oldest">Oldest</option><option value="name">Name</option></select></label>
      </div>
      {mutationError ? <ErrorState message={mutationError} /> : null}
      <AdminPageState loading={loading} error={error} empty={!data?.items.length} />
      {data?.items.length ? (
        <AdminTable><thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Verified</th><th>Active</th><th>Actions</th></tr></thead>
          <tbody>{data.items.map((user) => <tr key={user.id}>
            <td><Link to={`/admin/users/${user.id}`}>{user.full_name}</Link></td><td>{user.email}</td><td>{user.role}</td>
            <td>{user.is_verified ? 'Yes' : 'No'}</td><td>{user.is_active ? 'Active' : 'Inactive'}</td>
            <td className="admin-table-actions">
              {user.role !== 'admin' && !user.is_verified ? <button className="button button-secondary" disabled={busy} onClick={() => void update(user.id, { is_verified: true, is_active: true })}><Check size={15} />Approve</button> : null}
              {user.role !== 'admin' && user.is_active ? <button className="button button-secondary" disabled={busy} onClick={() => void reject(user.id)}><X size={15} />Reject</button> : null}
              {user.role !== 'admin' && !user.is_active ? <button className="button button-secondary" disabled={busy} onClick={() => void update(user.id, { is_active: true })}>Activate</button> : null}
            </td>
          </tr>)}</tbody>
        </AdminTable>
      ) : null}
      <AdminPagination data={data} onOffset={setOffset} />
    </>
  )
}

export function AdminUserDetailPage() {
  const { userId } = useParams()
  const { data, loading, error, reload } = useAdminResource<AdminUser>(`/admin/users/${userId}`)
  const { busy, error: mutationError, mutate } = useAdminMutation()
  async function update(body: { is_active?: boolean; is_verified?: boolean; reason?: string }) {
    if (userId && await mutate<AdminUser>(`/admin/users/${userId}`, 'PATCH', body)) await reload()
  }
  async function reject() {
    const reason = window.prompt('Reason for rejection')
    if (reason === null) return
    await update({ is_active: false, is_verified: false, reason })
  }
  return (
    <>
      <PageHeader eyebrow="Admin · Accounts" title="User details" description="Account role and status." />
      <AdminPageState loading={loading} error={error} empty={!data} />
      {data ? <section className="dashboard-panel admin-user-detail">
        <h2>{data.full_name}</h2>
        <dl><div><dt>Email</dt><dd>{data.email}</dd></div><div><dt>Role</dt><dd>{data.role}</dd></div><div><dt>Verified</dt><dd>{data.is_verified ? 'Yes' : 'No'}</dd></div><div><dt>Active</dt><dd>{data.is_active ? 'Active' : 'Inactive'}</dd></div></dl>
        {mutationError ? <ErrorState message={mutationError} /> : null}
        {data.role !== 'admin' && !data.is_verified ? <button className="button button-primary" disabled={busy} onClick={() => void update({ is_verified: true, is_active: true })}>Approve</button> : null}
        {data.role !== 'admin' && data.is_active ? <button className="button button-secondary" disabled={busy} onClick={() => void reject()}>Reject</button> : null}
        {data.role !== 'admin' && !data.is_active ? <button className="button button-secondary" disabled={busy} onClick={() => void update({ is_active: true })}>Activate</button> : null}
      </section> : null}
    </>
  )
}

function AvailabilityToggle({ path, available, reload }: { path: string; available: boolean; reload: () => Promise<void> }) {
  const { busy, error, mutate } = useAdminMutation()
  async function toggle() {
    if (await mutate(path, 'PATCH', { is_available: !available })) await reload()
  }
  return <><span>{available ? 'Available' : 'Unavailable'}</span><button className="button button-secondary" disabled={busy} onClick={() => void toggle()}>{available ? 'Deactivate' : 'Activate'}</button>{error ? <span role="alert">{error}</span> : null}</>
}

export function AdminFoodListingsPage() {
  const [search, setSearch] = useState('')
  const [available, setAvailable] = useState('')
  const [sort, setSort] = useState('newest')
  const [offset, setOffset] = useState(0)
  const query = new URLSearchParams({ limit: '25', offset: String(offset), sort })
  if (search.trim()) query.set('search', search.trim())
  if (available === 'expired') query.set('expired', 'true')
  else if (available) query.set('available', available)
  const { data, loading, error, reload } = useAdminResource<PageResult<FoodListing>>(`/admin/food-listings?${query}`)
  return (
    <>
      <PageHeader eyebrow="Admin · Donations" title="Food listings" description="Monitor donation availability and expiry." />
      <label className="admin-search"><Search aria-hidden="true" size={17} /><input value={search} onChange={(event) => { setSearch(event.target.value); setOffset(0) }} placeholder="Search listings" /></label>
      <div className="admin-filter-row">
        <label>Availability<select value={available} onChange={(event) => { setAvailable(event.target.value); setOffset(0) }}><option value="">All</option><option value="true">Available</option><option value="false">Unavailable</option><option value="expired">Expired</option></select></label>
        <label>Sort by<select value={sort} onChange={(event) => { setSort(event.target.value); setOffset(0) }}><option value="newest">Newest</option><option value="oldest">Oldest</option><option value="expiry">Expiry</option><option value="title">Title</option></select></label>
      </div>
      <AdminPageState loading={loading} error={error} empty={!data?.items.length} />
      {data?.items.length ? <AdminTable><thead><tr><th>Food</th><th>Quantity</th><th>Pickup location</th><th>Expiry</th><th>Creator</th><th>Availability</th></tr></thead><tbody>
        {data.items.map((listing) => <tr key={listing.id}><td>{listing.title}</td><td>{listing.quantity} {listing.unit}</td><td>{listing.pickup_location}</td><td>{new Date(listing.expires_at).toLocaleString()}</td><td>{listing.creator_id}</td><td><AvailabilityToggle path={`/admin/food-listings/${listing.id}`} available={listing.is_available} reload={reload} /></td></tr>)}
      </tbody></AdminTable> : null}
      <AdminPagination data={data} onOffset={setOffset} />
    </>
  )
}

export function AdminMapLocationsPage() {
  const [offset, setOffset] = useState(0)
  const { data, loading, error } = useAdminResource<PageResult<AdminMapLocation>>(
    `/admin/map-locations?limit=25&offset=${offset}`,
  )
  return (
    <>
      <PageHeader eyebrow="Admin · Map" title="Donation and delivery locations" description="Authorized map view of recorded pickup and delivery points." />
      <AdminPageState loading={loading} error={error} empty={!data?.items.length} />
      <div className="dashboard-card-grid">
        {data?.items.map((item) => (
          <article className="dashboard-panel compact-listing" key={`${item.listing_id}-${item.claim_id ?? 'listing'}`}>
            <h2>{item.title}</h2>
            <p>Listing #{item.listing_id} · Claim {item.claim_id ?? 'not claimed'} · {item.status}</p>
            <LocationMapPreview pickup={item.pickup} delivery={item.delivery} volunteer={item.volunteer} />
            {item.delivery ? <p>Delivery location: {item.delivery.address}</p> : null}
          </article>
        ))}
      </div>
      <AdminPagination data={data} onOffset={setOffset} />
    </>
  )
}

export function AdminStockClearancePage() {
  const [search, setSearch] = useState('')
  const [available, setAvailable] = useState('')
  const [sort, setSort] = useState('newest')
  const [offset, setOffset] = useState(0)
  const query = new URLSearchParams({ limit: '25', offset: String(offset), sort })
  if (search.trim()) query.set('search', search.trim())
  if (available === 'expired') query.set('expired', 'true')
  else if (available) query.set('available', available)
  const { data, loading, error, reload } = useAdminResource<PageResult<StockClearanceListing>>(`/admin/stock-clearance?${query}`)
  return (
    <>
      <PageHeader eyebrow="Admin · Flash Deals" title="Stock Clearance" description="Monitor discounted offers, remaining quantity, and expiry." />
      <label className="admin-search"><Search aria-hidden="true" size={17} /><input value={search} onChange={(event) => { setSearch(event.target.value); setOffset(0) }} placeholder="Search offers" /></label>
      <div className="admin-filter-row">
        <label>Availability<select value={available} onChange={(event) => { setAvailable(event.target.value); setOffset(0) }}><option value="">All</option><option value="true">Available</option><option value="false">Unavailable</option><option value="expired">Expired</option></select></label>
        <label>Sort by<select value={sort} onChange={(event) => { setSort(event.target.value); setOffset(0) }}><option value="newest">Newest</option><option value="oldest">Oldest</option><option value="expiry">Expiry</option><option value="title">Title</option></select></label>
      </div>
      <AdminPageState loading={loading} error={error} empty={!data?.items.length} />
      {data?.items.length ? <AdminTable><thead><tr><th>Offer</th><th>Quantity</th><th>Price</th><th>Discount</th><th>Expiry</th><th>Creator</th><th>Availability</th></tr></thead><tbody>
        {data.items.map((offer) => <tr key={offer.id}><td>{offer.title}</td><td>{offer.quantity} {offer.unit}</td><td>₹{(offer.discounted_price_paise / 100).toFixed(2)}</td><td>{offer.discount_percent}%</td><td>{new Date(offer.expires_at).toLocaleString()}</td><td>{offer.creator_id}</td><td><AvailabilityToggle path={`/admin/stock-clearance/${offer.id}`} available={offer.is_available} reload={reload} /></td></tr>)}
      </tbody></AdminTable> : null}
      <AdminPagination data={data} onOffset={setOffset} />
    </>
  )
}

export function AdminClaimsPage() {
  const [status, setStatus] = useState('')
  const [foodOffset, setFoodOffset] = useState(0)
  const [dealOffset, setDealOffset] = useState(0)
  const foodQuery = new URLSearchParams({ limit: '25', offset: String(foodOffset) })
  if (status) foodQuery.set('status_filter', status)
  const food = useAdminResource<PageResult<FoodClaim>>(`/admin/food-claims?${foodQuery}`)
  const deals = useAdminResource<PageResult<StockClearanceClaim>>(`/admin/stock-clearance-claims?limit=25&offset=${dealOffset}`)
  return (
    <>
      <PageHeader eyebrow="Admin · Monitoring" title="Claims" description="Food donation and Stock Clearance claims." />
      <h2>Food claims</h2>
      <label className="admin-filter-label">Status<select value={status} onChange={(event) => { setStatus(event.target.value); setFoodOffset(0) }}><option value="">All statuses</option>{['claimed', 'assigned', 'collected', 'delivered'].map((value) => <option key={value}>{value}</option>)}</select></label>
      <AdminPageState loading={food.loading} error={food.error} empty={!food.data?.items.length} />
      {food.data?.items.length ? <AdminTable><thead><tr><th>Claim</th><th>Listing</th><th>NGO</th><th>Agent</th><th>Status</th><th>Claimed</th></tr></thead><tbody>{food.data.items.map((claim) => <tr key={claim.id}><td>{claim.id}</td><td>{claim.listing_id}</td><td>{claim.ngo_id}</td><td>{claim.volunteer_id ?? '—'}</td><td>{claim.status}</td><td>{new Date(claim.claimed_at).toLocaleString()}</td></tr>)}</tbody></AdminTable> : null}
      <AdminPagination data={food.data} onOffset={setFoodOffset} />
      <h2>Stock Clearance claims</h2><AdminPageState loading={deals.loading} error={deals.error} empty={!deals.data?.items.length} />
      {deals.data?.items.length ? <AdminTable><thead><tr><th>Claim</th><th>Offer</th><th>Customer</th><th>Quantity</th><th>Discount</th><th>Claimed</th></tr></thead><tbody>{deals.data.items.map((claim) => <tr key={claim.id}><td>{claim.id}</td><td>{claim.listing_id}</td><td>{claim.customer_id}</td><td>{claim.quantity}</td><td>{claim.discount_percent}%</td><td>{new Date(claim.claimed_at).toLocaleString()}</td></tr>)}</tbody></AdminTable> : null}
      <AdminPagination data={deals.data} onOffset={setDealOffset} />
    </>
  )
}

export function AdminDeliveriesPage() {
  const [status, setStatus] = useState('')
  const [offset, setOffset] = useState(0)
  const query = new URLSearchParams({ limit: '25', offset: String(offset) })
  if (status) query.set('status_filter', status)
  const { data, loading, error } = useAdminResource<PageResult<FoodClaim>>(`/admin/deliveries?${query}`)
  return (
    <>
      <PageHeader eyebrow="Admin · Monitoring" title="Deliveries" description="Delivery status and assigned agent records." />
      <label className="admin-filter-label">Status<select value={status} onChange={(event) => { setStatus(event.target.value); setOffset(0) }}><option value="">All statuses</option>{['claimed', 'assigned', 'collected', 'delivered'].map((value) => <option key={value}>{value}</option>)}</select></label>
      <AdminPageState loading={loading} error={error} empty={!data?.items.length} />
      {data?.items.length ? <AdminTable><thead><tr><th>Claim</th><th>Listing</th><th>NGO</th><th>Agent</th><th>Status</th><th>Collected</th><th>Delivered</th></tr></thead><tbody>{data.items.map((task) => <tr key={task.id}><td>{task.id}</td><td>{task.listing_id}</td><td>{task.ngo_id}</td><td>{task.volunteer_id ?? '—'}</td><td>{task.status}</td><td>{task.collected_at ? new Date(task.collected_at).toLocaleString() : '—'}</td><td>{task.delivered_at ? new Date(task.delivered_at).toLocaleString() : '—'}</td></tr>)}</tbody></AdminTable> : null}
      <AdminPagination data={data} onOffset={setOffset} />
    </>
  )
}

export function AdminReportsPage() {
  const [days, setDays] = useState(30)
  const { data, loading, error } = useAdminResource<{
    analytics: Record<string, number>
    users_by_role: Record<string, number>
    food_claims_by_status: Record<string, number>
    quantity_by_unit: Record<string, Record<string, number>>
    trends: Record<string, { date: string; count: number }[]>
    period_days: number
  }>(`/admin/reports/impact?days=${days}`)
  return (
    <>
      <PageHeader eyebrow="Admin · Reports" title="Impact reports" description="Counts and status breakdowns from recorded platform data." />
      <label className="admin-filter-label">Time range<select value={days} onChange={(event) => setDays(Number(event.target.value))}><option value={7}>7 days</option><option value={30}>30 days</option><option value={90}>90 days</option></select></label>
      {loading ? <LoadingState /> : null}
      {error ? <ErrorState message={error} /> : null}
      {data ? <div className="admin-report-grid">
        {Object.entries(data.analytics).map(([label, value]) => <article className="dashboard-stat" key={label}><strong>{value}</strong><span>{label.replaceAll('_', ' ')}</span></article>)}
        <article className="dashboard-panel"><h2>Users by role</h2>{Object.entries(data.users_by_role).map(([label, count]) => <p key={label}>{label}: {count}</p>)}</article>
        <article className="dashboard-panel"><h2>Food claims by status</h2>{Object.entries(data.food_claims_by_status).map(([label, count]) => <p key={label}>{label}: {count}</p>)}</article>
        <article className="dashboard-panel admin-unit-report">
          <h2>Quantity totals by unit</h2>
          <div className="admin-table-scroll"><table className="admin-table">
            <thead><tr><th>Unit</th><th>Listed</th><th>Claimed</th><th>Delivered</th><th>Stock Clearance claimed</th></tr></thead>
            <tbody>{[...new Set(Object.values(data.quantity_by_unit).flatMap((values) => Object.keys(values)))].map((unit) => (
              <tr key={unit}><td>{unit}</td><td>{data.quantity_by_unit.listed?.[unit] ?? 0}</td><td>{data.quantity_by_unit.claimed?.[unit] ?? 0}</td><td>{data.quantity_by_unit.delivered?.[unit] ?? 0}</td><td>{data.quantity_by_unit.stock_clearance_claimed?.[unit] ?? 0}</td></tr>
            ))}</tbody>
          </table></div>
          <p>Donation quantities reflect full-listing claims. Units are not combined.</p>
        </article>
        {Object.entries(data.trends).map(([key, points]) => {
          const maximum = Math.max(...points.map((point) => point.count), 1)
          return <article className="dashboard-panel admin-trend" key={key}>
            <h2>{key.replaceAll('_', ' ')} · {data.period_days} days</h2>
            <div className="admin-trend-bars" role="img" aria-label={`${key.replaceAll('_', ' ')} counts over ${data.period_days} days`}>
              {points.map((point) => <span key={point.date} title={`${point.date}: ${point.count}`} style={{ height: `${Math.max(point.count / maximum * 100, point.count ? 6 : 1)}%` }} />)}
            </div>
            <div className="admin-trend-range"><span>{points[0]?.date}</span><strong>Total: {points.reduce((sum, point) => sum + point.count, 0)}</strong><span>{points.at(-1)?.date}</span></div>
          </article>
        })}
      </div> : null}
    </>
  )
}

export function AdminAuditLogsPage() {
  const [offset, setOffset] = useState(0)
  const { data, loading, error } = useAdminResource<PageResult<AdminAuditLog>>(`/admin/audit-logs?limit=25&offset=${offset}`)
  return (
    <>
      <PageHeader eyebrow="Admin · Security" title="Audit logs" description="Recorded administrative actions." />
      <AdminPageState loading={loading} error={error} empty={!data?.items.length} />
      {data?.items.length ? <AdminTable><thead><tr><th>Date</th><th>Actor</th><th>Action</th><th>Resource</th><th>Details</th></tr></thead><tbody>{data.items.map((log) => <tr key={log.id}><td>{new Date(log.created_at).toLocaleString()}</td><td>{log.actor_type === 'admin' ? log.admin_id : log.actor_type}</td><td>{log.action}</td><td>{log.resource_type} {log.resource_id ?? ''}</td><td><code>{JSON.stringify(log.details)}</code></td></tr>)}</tbody></AdminTable> : null}
      <AdminPagination data={data} onOffset={setOffset} />
    </>
  )
}
