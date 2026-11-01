import { Navigate, Route, Routes } from 'react-router-dom'
import { useAppContext } from '../context/AppContext'
import { DashboardLayout } from '../layout/DashboardLayout'
import { AuthPage, NotFoundPage } from '../pages/PublicPages'
import {
  CreateDonationPage,
  CreateStockOfferPage,
  MyDonationsPage,
  MyStockOffersPage,
  RestaurantDashboard,
} from '../pages/RestaurantPages'
import { AvailableDonationsPage, NgoClaimsPage, NgoDashboard } from '../pages/NgoPages'
import {
  AvailableFoodPage,
  FlashDealsPage,
  MyFlashDealClaimsPage,
  UserDashboard,
} from '../pages/UserPages'
import { AgentDashboard, AvailableTasksPage, MyTasksPage, SchoolDashboard } from '../pages/AgentSchoolPages'
import { ProtectedRoute } from './ProtectedRoute'
import {
  AdminAuditLogsPage,
  AdminDashboard,
  AdminDeliveriesPage,
  AdminFoodListingsPage,
  AdminMapLocationsPage,
  AdminReportsPage,
  AdminStockClearancePage,
  AdminUserDetailPage,
  AdminUsersPage,
  AdminClaimsPage,
} from '../pages/AdminPages'

function DashboardRedirect() {
  const { currentUser, authLoading } = useAppContext()
  if (authLoading) return <p className="route-loading" role="status">Verifying your session...</p>
  return <Navigate to={currentUser ? `/${currentUser.role}/dashboard` : '/login'} replace />
}

export function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<DashboardRedirect />} />
      <Route path="/login" element={<AuthPage mode="login" />} />
      <Route path="/register" element={<AuthPage mode="register" />} />
      <Route path="/dashboard" element={<DashboardRedirect />} />

      <Route element={<ProtectedRoute roles={['restaurant']} />}>
        <Route element={<DashboardLayout />}>
          <Route path="/restaurant/dashboard" element={<RestaurantDashboard />} />
          <Route path="/restaurant/donations/create" element={<CreateDonationPage />} />
          <Route path="/restaurant/donations" element={<MyDonationsPage />} />
          <Route path="/restaurant/stock-clearance/create" element={<CreateStockOfferPage />} />
          <Route path="/restaurant/stock-clearance" element={<MyStockOffersPage />} />
        </Route>
      </Route>

      <Route element={<ProtectedRoute roles={['ngo']} />}>
        <Route element={<DashboardLayout />}>
          <Route path="/ngo/dashboard" element={<NgoDashboard />} />
          <Route path="/ngo/donations" element={<AvailableDonationsPage />} />
          <Route path="/ngo/claims" element={<NgoClaimsPage />} />
        </Route>
      </Route>

      <Route element={<ProtectedRoute roles={['user']} />}>
        <Route element={<DashboardLayout />}>
          <Route path="/user/dashboard" element={<UserDashboard />} />
          <Route path="/user/food" element={<AvailableFoodPage />} />
          <Route path="/user/flash-deals" element={<FlashDealsPage />} />
          <Route path="/user/flash-deals/my-claims" element={<MyFlashDealClaimsPage />} />
        </Route>
      </Route>

      <Route element={<ProtectedRoute roles={['agent']} />}>
        <Route element={<DashboardLayout />}>
          <Route path="/agent/dashboard" element={<AgentDashboard />} />
          <Route path="/agent/tasks/available" element={<AvailableTasksPage />} />
          <Route path="/agent/tasks/my-tasks" element={<MyTasksPage />} />
        </Route>
      </Route>

      <Route element={<ProtectedRoute roles={['school']} />}>
        <Route element={<DashboardLayout />}>
          <Route path="/school/dashboard" element={<SchoolDashboard />} />
        </Route>
      </Route>

      <Route element={<ProtectedRoute roles={['admin']} />}>
        <Route element={<DashboardLayout />}>
          <Route path="/admin/dashboard" element={<AdminDashboard />} />
          <Route path="/admin/users" element={<AdminUsersPage />} />
          <Route path="/admin/users/:userId" element={<AdminUserDetailPage />} />
          <Route path="/admin/listings" element={<AdminFoodListingsPage />} />
          <Route path="/admin/map-locations" element={<AdminMapLocationsPage />} />
          <Route path="/admin/stock-clearance" element={<AdminStockClearancePage />} />
          <Route path="/admin/claims" element={<AdminClaimsPage />} />
          <Route path="/admin/deliveries" element={<AdminDeliveriesPage />} />
          <Route path="/admin/reports" element={<AdminReportsPage />} />
          <Route path="/admin/audit-logs" element={<AdminAuditLogsPage />} />
        </Route>
      </Route>

      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  )
}
