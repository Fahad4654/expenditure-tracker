import { Route, Routes } from 'react-router-dom';
import AppLayout from './components/AppLayout/AppLayout';
import AuthProvider from './auth/AuthProvider';
import { GuestOnlyRoute, ProtectedRoute } from './auth/ProtectedRoute';
import CategoriesPage from './pages/CategoriesPage/CategoriesPage';
import DashboardPage from './pages/DashboardPage/DashboardPage';
import HomePage from './pages/HomePage/HomePage';
import LoginPage from './pages/LoginPage/LoginPage';
import NotFoundPage from './pages/NotFoundPage/NotFoundPage';
import ProfilePage from './pages/ProfilePage/ProfilePage';
import RegisterPage from './pages/RegisterPage/RegisterPage';
import ReportsPage from './pages/ReportsPage/ReportsPage';
import TransactionDetailPage from './pages/TransactionDetailPage/TransactionDetailPage';
import TransactionNewPage from './pages/TransactionNewPage/TransactionNewPage';
import TransactionsPage from './pages/TransactionsPage/TransactionsPage';
import UnavailablePage from './pages/UnavailablePage/UnavailablePage';
import { ROUTES } from './routes';

/**
 * Route table.
 *
 * One layout route owns the chrome (header/footer); inside it the public
 * landing page, the guest-only auth screens, the honest placeholders for
 * deferred email/SMS flows, and the protected application section hang.
 */
export default function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route element={<AppLayout />}>
          <Route path={ROUTES.home} element={<HomePage />} />

          <Route element={<GuestOnlyRoute />}>
            <Route path={ROUTES.login} element={<LoginPage />} />
            <Route path={ROUTES.register} element={<RegisterPage />} />
          </Route>

          {/* Designed but not wired up: no mail/SMS provider yet. */}
          <Route path={ROUTES.forgotPassword} element={<UnavailablePage />} />
          <Route path={ROUTES.verifyEmail} element={<UnavailablePage />} />
          <Route path={ROUTES.verifyPhone} element={<UnavailablePage />} />

          <Route element={<ProtectedRoute />}>
            <Route path={ROUTES.dashboard} element={<DashboardPage />} />
            <Route path={ROUTES.transactions} element={<TransactionsPage />} />
            <Route path={ROUTES.transactionNew} element={<TransactionNewPage />} />
            <Route path={ROUTES.transactionDetailPattern} element={<TransactionDetailPage />} />
            <Route path={ROUTES.categories} element={<CategoriesPage />} />
            <Route path={ROUTES.reports} element={<ReportsPage />} />
            <Route path={ROUTES.profile} element={<ProfilePage />} />
            <Route path={ROUTES.settings} element={<ProfilePage />} />
          </Route>

          <Route path="*" element={<NotFoundPage />} />
        </Route>
      </Routes>
    </AuthProvider>
  );
}
