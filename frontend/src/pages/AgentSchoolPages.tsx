import { useState } from 'react'
import { Link } from 'react-router-dom'
import { ClipboardList, Truck } from 'lucide-react'
import { DonationTracking } from '../components/DonationTracking'
import { EmptyState, ErrorState, LoadingState, PageHeader } from '../components/PagePrimitives'
import { ResultsPagination } from '../components/ResultsPagination'
import { useAppContext } from '../context/AppContext'
import { usePagedResource } from '../hooks/usePagedResource'
import type { VolunteerTask } from '../types'

export function AgentDashboard() {
  const { currentUser, volunteerTasks } = useAppContext()
  const pending = volunteerTasks.filter((task) => task.status === 'claimed' && task.volunteer_id === null).length
  const assigned = volunteerTasks.filter((task) => task.volunteer_id === currentUser?.id).length
  return (
    <>
      <PageHeader eyebrow="Volunteer workspace" title={`Welcome, ${currentUser?.full_name.split(' ')[0] ?? 'Volunteer'}`} description="Review open pickup tasks and update the status of tasks assigned to you." />
      <div className="dashboard-overview-grid">
        <div className="quick-action-grid dashboard-center-actions">
          <Link to="/agent/tasks/available"><strong>Available tasks</strong><span>Open the available volunteer task queue.</span></Link>
          <Link to="/agent/tasks/my-tasks"><strong>My tasks</strong><span>Track tasks assigned to your account.</span></Link>
        </div>
        <div className="dashboard-stat-grid dashboard-side-stats">
          <article className="dashboard-stat"><span className="dashboard-stat-icon"><ClipboardList aria-hidden="true" /></span><strong>{pending}</strong><span>Tasks available for collection</span></article>
          <article className="dashboard-stat"><span className="dashboard-stat-icon"><Truck aria-hidden="true" /></span><strong>{assigned}</strong><span>Tasks assigned to you</span></article>
        </div>
      </div>
    </>
  )
}

function TaskList({ mine }: { mine: boolean }) {
  const { currentUser, taskBusy, taskError, taskMessage, updateTaskStatus } = useAppContext()
  const [status, setStatus] = useState('')
  const [sort, setSort] = useState('newest')
  const [offset, setOffset] = useState(0)
  const query = new URLSearchParams({ scope: mine ? 'mine' : 'available', limit: '25', offset: String(offset), sort })
  if (status) query.set('status_filter', status)
  const { data, loading, error, reload } = usePagedResource<VolunteerTask>(`/volunteer/tasks/search?${query}`)
  const tasks = data?.items ?? []

  async function updateTask(claimId: number, action: 'accept' | 'collect' | 'deliver') {
    await updateTaskStatus(claimId, action)
    await reload()
  }

  return (
    <>
      <PageHeader
        eyebrow="Volunteer · Delivery tasks"
        title={mine ? 'My tasks' : 'Available tasks'}
        description={mine ? 'Only tasks assigned to your volunteer account are shown here.' : 'Accept open tasks, collect food, and complete assigned deliveries.'}
        action={<button type="button" className="button button-secondary" onClick={() => void reload()}>Refresh tasks</button>}
      />
      <div className="history-controls">
        <label>Status<select value={status} onChange={(event) => { setStatus(event.target.value); setOffset(0) }}><option value="">All statuses</option>{['claimed', 'assigned', 'collected', 'delivered'].map((value) => <option key={value}>{value}</option>)}</select></label>
        <label>Sort by<select value={sort} onChange={(event) => { setSort(event.target.value); setOffset(0) }}><option value="newest">Newest</option><option value="oldest">Oldest</option></select></label>
      </div>
      {taskMessage ? <p className="route-success" role="status">{taskMessage}</p> : null}
      {taskError ? <ErrorState message={taskError} /> : null}
      {loading ? <LoadingState label="Loading tasks..." /> : null}
      {error ? <ErrorState message={error} /> : null}
      {tasks.length === 0 && !taskError && !error && !loading ? <EmptyState>{mine ? 'No tasks are assigned to you.' : 'No unassigned pickup tasks are available.'}</EmptyState> : null}
      <div className="dashboard-card-grid">
        {!loading && !error ? tasks.map((task) => (
          <article className="dashboard-panel compact-listing" key={task.id}>
            <span className={`food-category status-badge status-${task.status}`}>{task.status}</span>
            <h2>Pickup task #{task.id}</h2>
            <h3>{task.listing.title}</h3>
            <dl><div><dt>Quantity</dt><dd>{task.listing.quantity} {task.listing.unit}</dd></div><div><dt>Pickup location</dt><dd>{task.listing.pickup_location}</dd></div><div><dt>Claimed</dt><dd>{new Date(task.claimed_at).toLocaleString()}</dd></div><div><dt>Collected</dt><dd>{task.collected_at ? new Date(task.collected_at).toLocaleString() : 'Not yet'}</dd></div><div><dt>Delivered</dt><dd>{task.delivered_at ? new Date(task.delivered_at).toLocaleString() : 'Not yet'}</dd></div></dl>
            <DonationTracking claim={task} />
            {task.status === 'claimed' && task.volunteer_id === null ? (
              <button type="button" className="button button-primary" disabled={taskBusy === task.id} onClick={() => void updateTask(task.id, 'accept')}>{taskBusy === task.id ? 'Updating...' : 'Accept task'}</button>
            ) : null}
            {task.status === 'assigned' && task.volunteer_id === currentUser?.id ? (
              <button type="button" className="button button-primary" disabled={taskBusy === task.id} onClick={() => void updateTask(task.id, 'collect')}>{taskBusy === task.id ? 'Updating...' : 'Mark collected'}</button>
            ) : null}
            {task.status === 'collected' && task.volunteer_id === currentUser?.id ? (
              <button type="button" className="button button-primary" disabled={taskBusy === task.id} onClick={() => void updateTask(task.id, 'deliver')}>{taskBusy === task.id ? 'Updating...' : 'Mark delivered'}</button>
            ) : null}
            {task.status === 'delivered' ? <p className="route-success">Delivery completed.</p> : null}
          </article>
        )) : null}
      </div>
      <ResultsPagination data={data} onOffsetChange={setOffset} />
    </>
  )
}

export function AvailableTasksPage() {
  return <TaskList mine={false} />
}

export function MyTasksPage() {
  return <TaskList mine />
}

export function SchoolDashboard() {
  return (
    <>
      <PageHeader eyebrow="School account" title="School workspace" description="School accounts are supported, but no dedicated school workflow or endpoints are currently implemented." />
      <EmptyState>School dashboard actions are not available in the current application. Existing listing access is view-only; ask an administrator before introducing a school-specific workflow.</EmptyState>
    </>
  )
}
