import { useCallback, useEffect, useState } from 'react'
import { Bell } from 'lucide-react'
import { Link } from 'react-router-dom'
import { apiRequest } from '../services/api'
import type { NotificationItem } from '../types'
import { useAppContext } from '../context/AppContext'

type NotificationsResult = {
  items: NotificationItem[]
  unread: number
}

function NotificationBell() {
  const { token } = useAppContext()
  const [notifications, setNotifications] = useState<NotificationItem[]>([])
  const [unread, setUnread] = useState(0)
  const [open, setOpen] = useState(false)
  const [error, setError] = useState('')

  const loadNotifications = useCallback(async () => {
    try {
      const result = await apiRequest<NotificationsResult>('/notifications?limit=20', {}, token)
      setNotifications(result.items)
      setUnread(result.unread)
      setError('')
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to load notifications.')
    }
  }, [token])

  useEffect(() => {
    const timer = window.setTimeout(() => void loadNotifications(), 0)
    return () => window.clearTimeout(timer)
  }, [loadNotifications])

  async function markRead(notification: NotificationItem) {
    if (notification.read_at) return
    try {
      const updated = await apiRequest<NotificationItem>(
        `/notifications/${notification.id}/read`,
        { method: 'POST' },
        token,
      )
      setNotifications((items) => items.map((item) => item.id === updated.id ? updated : item))
      setUnread((count) => Math.max(0, count - 1))
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to mark the notification as read.')
    }
  }

  return (
    <div className="notification-menu">
      <button
        type="button"
        className="notification-trigger"
        aria-label={`Notifications${unread ? `, ${unread} unread` : ''}`}
        aria-expanded={open}
        onClick={() => { setOpen((value) => !value); void loadNotifications() }}
      >
        <Bell aria-hidden="true" size={18} />
        {unread ? <span className="notification-count">{unread}</span> : null}
      </button>
      {open ? <section className="notification-popover" aria-label="Notifications">
        <header><strong>Notifications</strong><button type="button" className="notification-close" onClick={() => setOpen(false)} aria-label="Close notifications">×</button></header>
        {error ? <p role="alert">{error}</p> : null}
        {!error && notifications.length === 0 ? <p>No notifications.</p> : null}
        <ul>
          {notifications.map((notification) => (
            <li key={notification.id} className={notification.read_at ? '' : 'notification-unread'}>
              <button type="button" onClick={() => void markRead(notification)}>
                <strong>{notification.title}</strong>
                <span>{notification.message}</span>
                <small>{new Date(notification.created_at).toLocaleString()}</small>
              </button>
            </li>
          ))}
        </ul>
      </section> : null}
    </div>
  )
}

export function Navbar() {
  const { currentUser, logout } = useAppContext()

  return (
    <header className="site-nav">
      <Link className="brand-mark" to="/" aria-label="FoodRescue home">
        <span className="brand-icon" aria-hidden="true">
          <svg viewBox="0 0 32 32" fill="none">
            <path d="M25.8 5.2C16 5.7 8.3 8.7 7 15.1c-.7 3.5 1.7 6.4 5.1 6.4 6.5 0 10.7-7.5 13.7-16.3Z" fill="currentColor" />
            <path d="M5.5 27c3.4-7.2 8.4-11.4 15.3-15.1" stroke="white" strokeWidth="2" strokeLinecap="round" />
          </svg>
        </span>
        <span>
          <strong>FOODRESCUE</strong>
          <small>Good food, shared well</small>
        </span>
      </Link>

      <div className="nav-account">
        {currentUser ? (
          <>
            <NotificationBell />
            <span className="account-avatar" aria-hidden="true">
              {currentUser.full_name.trim().charAt(0).toUpperCase()}
            </span>
            <span className="account-summary">
              <strong>{currentUser.full_name}</strong>
              <small>{currentUser.role}</small>
            </span>
            <button type="button" onClick={logout} className="button button-secondary">Log out</button>
          </>
        ) : (
          <>
            <Link to="/login" className="button button-quiet">Log in</Link>
            <Link to="/register" className="button button-primary">Get started</Link>
          </>
        )}
      </div>
    </header>
  )
}

export function Footer() {
  return (
    <footer className="site-footer">
      <Link className="brand-mark" to="/" aria-label="FoodRescue home">
        <span className="brand-icon" aria-hidden="true">
          <svg viewBox="0 0 32 32" fill="none">
            <path d="M25.8 5.2C16 5.7 8.3 8.7 7 15.1c-.7 3.5 1.7 6.4 5.1 6.4 6.5 0 10.7-7.5 13.7-16.3Z" fill="currentColor" />
            <path d="M5.5 27c3.4-7.2 8.4-11.4 15.3-15.1" stroke="white" strokeWidth="2" strokeLinecap="round" />
          </svg>
        </span>
        <span><strong>FOODRESCUE</strong><small>Good food, shared well</small></span>
      </Link>
      <p>Rescue food. Reduce waste. Feed communities.</p>
      <Link to="/user/food">Explore available food ↑</Link>
    </footer>
  )
}
