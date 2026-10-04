import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { FullPageLoading } from '../components/ui';
import { ROUTES } from '../routes';
import { useAuth } from './auth-context';

/**
 * Wraps the authenticated section. While the silent refresh is still running we
 * render a spinner rather than the login page — redirecting first would bounce
 * an existing session through `/login` on every reload.
 */
export function ProtectedRoute() {
  const { status } = useAuth();
  const location = useLocation();

  if (status === 'loading') return <FullPageLoading />;
  if (status === 'anonymous') {
    return (
      <Navigate
        to={ROUTES.login}
        replace
        state={{ from: `${location.pathname}${location.search}` }}
      />
    );
  }
  return <Outlet />;
}

/** Login/register are pointless for an already-authenticated visitor. */
export function GuestOnlyRoute() {
  const { status } = useAuth();

  if (status === 'loading') return <FullPageLoading />;
  if (status === 'authenticated') return <Navigate to={ROUTES.dashboard} replace />;
  return <Outlet />;
}

/**
 * Wraps the admin section. The server is the authority — `AdminGuard` answers
 * 403 for a non-admin — but bouncing to the dashboard reads better than a
 * dead-end error page, and hides the link before anyone clicks it.
 */
export function AdminRoute() {
  const { status, user } = useAuth();

  if (status === 'loading') return <FullPageLoading />;
  if (status === 'anonymous') return <Navigate to={ROUTES.login} replace />;
  if (user?.role !== 'ADMIN') return <Navigate to={ROUTES.dashboard} replace />;
  return <Outlet />;
}
