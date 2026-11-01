import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAppContext } from '../context/AppContext'
import type { Role } from '../types'

export function ProtectedRoute({ roles }: { roles: Role[] }) {
  const { currentUser, authLoading } = useAppContext()
  const location = useLocation()

  if (authLoading) {
    return <p className="route-loading" role="status">Verifying your session...</p>
  }

  if (!currentUser) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />
  }

  if (!roles.includes(currentUser.role)) {
    return <Navigate to={`/${currentUser.role}/dashboard`} replace />
  }

  return <Outlet />
}
