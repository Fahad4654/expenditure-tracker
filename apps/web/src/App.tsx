import { Route, Routes } from 'react-router-dom';
import AppLayout from './components/AppLayout/AppLayout';
import AuthProvider from './auth/AuthProvider';
import { GuestOnlyRoute, ProtectedRoute } from './auth/ProtectedRoute';
import CategoriesPage from './pages/CategoriesPage/CategoriesPage';
import BugReportsPage from './pages/BugReportsPage/BugReportsPage';
import DashboardPage from './pages/DashboardPage/DashboardPage';
import HomePage from './pages/HomePage/HomePage';
import ForgotPasswordPage from './pages/ForgotPasswordPage/ForgotPasswordPage';
import LoginPage from './pages/LoginPage/LoginPage';
import NotFoundPage from './pages/NotFoundPage/NotFoundPage';
import NotesPage from './pages/NotesPage/NotesPage';
import RemindersPage from './pages/RemindersPage/RemindersPage';
import StatusPage from './pages/StatusPage/StatusPage';
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
 * The marketing landing page sits outside the app chrome — it renders its own
 * navbar and footer and redirects an existing session to the dashboard. Every
 * other page hangs off one layout route: guest-only auth screens, the honest
 * placeholders for deferred flows, the public status page, and the protected
 * application section.
 */
export default function App() {
  return (
    <AuthProvider>
      <Routes>
        {/* The marketing landing page owns its own chrome (nav + footer). */}
        <Route path={ROUTES.home} element={<HomePage />} />

        <Route element={<AppLayout />}>
          <Route path={ROUTES.status} element={<StatusPage />} />

          <Route element={<GuestOnlyRoute />}>
            <Route path={ROUTES.login} element={<LoginPage />} />
            <Route path={ROUTES.register} element={<RegisterPage />} />
            <Route path={ROUTES.forgotPassword} element={<ForgotPasswordPage />} />
          </Route>

          {/* Designed but not wired up: no SMS provider yet. */}
          <Route path={ROUTES.verifyPhone} element={<UnavailablePage />} />

          <Route element={<ProtectedRoute />}>
            <Route path={ROUTES.dashboard} element={<DashboardPage />} />
            <Route path={ROUTES.transactions} element={<TransactionsPage />} />
            <Route path={ROUTES.transactionNew} element={<TransactionNewPage />} />
            <Route path={ROUTES.transactionDetailPattern} element={<TransactionDetailPage />} />
            <Route path={ROUTES.categories} element={<CategoriesPage />} />
            <Route path={ROUTES.notes} element={<NotesPage />} />
            <Route path={ROUTES.reminders} element={<RemindersPage />} />
            <Route path={ROUTES.reports} element={<ReportsPage />} />
            <Route path={ROUTES.bugReports} element={<BugReportsPage />} />
            <Route path={ROUTES.profile} element={<ProfilePage />} />
            <Route path={ROUTES.settings} element={<ProfilePage />} />
          </Route>

          <Route path="*" element={<NotFoundPage />} />
        </Route>
      </Routes>
    </AuthProvider>
  );
}
