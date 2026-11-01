import { NavLink, Outlet } from 'react-router-dom'
import {
  ClipboardList,
  ShieldCheck,
  HandHeart,
  LayoutDashboard,
  PackagePlus,
  ReceiptText,
  Tags,
  Truck,
  Utensils,
} from 'lucide-react'
import { useAppContext } from '../context/AppContext'
import { Footer, Navbar } from '../components/Navbar'
import type { Role } from '../types'

const navigation: Record<Role, { label: string; to: string; icon: typeof LayoutDashboard }[]> = {
  restaurant: [
    { label: 'Dashboard', to: '/restaurant/dashboard', icon: LayoutDashboard },
    { label: 'Create donation', to: '/restaurant/donations/create', icon: PackagePlus },
    { label: 'Available donations', to: '/restaurant/donations', icon: Utensils },
    { label: 'Create Flash Deal', to: '/restaurant/stock-clearance/create', icon: Tags },
    { label: 'Available deals', to: '/restaurant/stock-clearance', icon: ReceiptText },
  ],
  ngo: [
    { label: 'Dashboard', to: '/ngo/dashboard', icon: LayoutDashboard },
    { label: 'Available donations', to: '/ngo/donations', icon: Utensils },
    { label: 'My claims', to: '/ngo/claims', icon: HandHeart },
  ],
  user: [
    { label: 'Dashboard', to: '/user/dashboard', icon: LayoutDashboard },
    { label: 'Available food', to: '/user/food', icon: Utensils },
    { label: 'Flash Deals', to: '/user/flash-deals', icon: Tags },
    { label: 'My deal claims', to: '/user/flash-deals/my-claims', icon: ReceiptText },
  ],
  agent: [
    { label: 'Dashboard', to: '/agent/dashboard', icon: LayoutDashboard },
    { label: 'Available tasks', to: '/agent/tasks/available', icon: ClipboardList },
    { label: 'My tasks', to: '/agent/tasks/my-tasks', icon: Truck },
  ],
  school: [{ label: 'Dashboard', to: '/school/dashboard', icon: LayoutDashboard }],
  admin: [
    { label: 'Dashboard', to: '/admin/dashboard', icon: LayoutDashboard },
    { label: 'Users', to: '/admin/users', icon: ShieldCheck },
    { label: 'Donations', to: '/admin/listings', icon: Utensils },
    { label: 'Flash Deals', to: '/admin/stock-clearance', icon: Tags },
    { label: 'Claims', to: '/admin/claims', icon: HandHeart },
    { label: 'Deliveries', to: '/admin/deliveries', icon: Truck },
    { label: 'Reports', to: '/admin/reports', icon: ReceiptText },
    { label: 'Audit logs', to: '/admin/audit-logs', icon: ClipboardList },
  ],
}

export function DashboardLayout() {
  const { currentUser, toast, setToast } = useAppContext()
  if (!currentUser) return null

  return (
    <div className="app-shell min-h-screen">
      <Navbar />
      <div className="dashboard-frame">
        <aside className="dashboard-sidebar" aria-label={`${currentUser.role} navigation`}>
          <div className="sidebar-heading">
            <span className="eyebrow">{currentUser.role} workspace</span>
            <strong>{currentUser.full_name}</strong>
          </div>
          <nav className="sidebar-links">
            {navigation[currentUser.role].map(({ label, to, icon: Icon }) => (
              <NavLink
                key={to}
                to={to}
                className={({ isActive }) => `sidebar-link${isActive ? ' sidebar-link-active' : ''}`}
                end
              >
                <Icon aria-hidden="true" size={18} />
                <span>{label}</span>
              </NavLink>
            ))}
          </nav>
        </aside>
        <main className="dashboard-main">
          <Outlet />
        </main>
      </div>
      <Footer />
      {toast && (
        <div className={`app-toast app-toast-${toast.tone}`} role={toast.tone === 'error' ? 'alert' : 'status'}>
          <span>{toast.message}</span>
          <button type="button" onClick={() => setToast(null)} aria-label="Dismiss notification">×</button>
        </div>
      )}
    </div>
  )
}
