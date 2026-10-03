import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../../auth/auth-context';
import { ROUTES } from '../../routes';
import { Button, Spinner } from '../ui';

const NAV_LINKS = [
  { to: ROUTES.dashboard, label: 'Dashboard' },
  { to: ROUTES.transactions, label: 'Transactions' },
  { to: ROUTES.reports, label: 'Reports' },
  { to: ROUTES.categories, label: 'Categories' },
] as const;

const linkClass = ({ isActive }: { isActive: boolean }) =>
  `rounded-md px-3 py-2 transition ${
    isActive
      ? 'bg-slate-800 text-white'
      : 'text-slate-400 hover:bg-slate-900 hover:text-slate-200'
  }`;

/**
 * Navigation sidebar for the app shell. Rendered persistently on large
 * screens and inside the mobile drawer on small ones. `onNavigate` lets the
 * drawer close itself after a link is followed.
 */
export default function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  const { status, user, logout } = useAuth();
  const navigate = useNavigate();
  const signedIn = status === 'authenticated';

  async function handleLogout() {
    await logout();
    navigate(ROUTES.home, { replace: true });
  }

  return (
    <div className="flex h-full flex-col gap-6 p-4">
      <NavLink
        to={signedIn ? ROUTES.dashboard : ROUTES.home}
        onClick={onNavigate}
        className="flex items-center gap-2 px-2 py-1 font-semibold text-white"
      >
        <span aria-hidden className="text-emerald-400">
          ৳
        </span>
        Expenditure Tracker
      </NavLink>

      <nav aria-label="Main navigation" className="flex flex-col gap-1 text-sm">
        {signedIn ? (
          NAV_LINKS.map((link) => (
            <NavLink key={link.to} to={link.to} onClick={onNavigate} className={linkClass}>
              {link.label}
            </NavLink>
          ))
        ) : (
          <p className="px-3 text-xs text-slate-500">
            Sign in to track transactions, reports, and categories.
          </p>
        )}
      </nav>

      <div className="mt-auto flex flex-col gap-2 text-sm">
        {status === 'loading' ? (
          <div className="px-3">
            <Spinner label="Checking session" />
          </div>
        ) : signedIn && user ? (
          <>
            <NavLink to={ROUTES.profile} onClick={onNavigate} className={linkClass}>
              {user.name}
            </NavLink>
            <Button variant="ghost" className="justify-start" onClick={() => void handleLogout()}>
              Sign out
            </Button>
          </>
        ) : (
          <>
            <NavLink to={ROUTES.login} onClick={onNavigate} className={linkClass}>
              Sign in
            </NavLink>
            <NavLink
              to={ROUTES.register}
              onClick={onNavigate}
              className="rounded-lg bg-emerald-500 px-3 py-2 text-center font-medium text-slate-950 transition hover:bg-emerald-400"
            >
              Create account
            </NavLink>
          </>
        )}
      </div>
    </div>
  );
}
