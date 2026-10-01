import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { API_BASE_URL } from '../../lib/api';
import { useAuth } from '../../auth/auth-context';
import { ROUTES } from '../../routes';
import { Button, Spinner } from '../ui';

const NAV_LINKS = [
  { to: ROUTES.dashboard, label: 'Dashboard' },
  { to: ROUTES.transactions, label: 'Transactions' },
  { to: ROUTES.reports, label: 'Reports' },
  { to: ROUTES.categories, label: 'Categories' },
] as const;

/**
 * Shell around every page. The navigation only appears once a session exists,
 * so the marketing landing page stays uncluttered.
 */
export default function AppLayout() {
  const { status, user, logout } = useAuth();
  const navigate = useNavigate();
  const signedIn = status === 'authenticated';

  async function handleLogout() {
    await logout();
    navigate(ROUTES.home, { replace: true });
  }

  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-b border-slate-800 bg-slate-950/80 backdrop-blur">
        <div className="mx-auto flex w-full max-w-5xl flex-wrap items-center justify-between gap-3 px-6 py-4">
          <NavLink
            to={signedIn ? ROUTES.dashboard : ROUTES.home}
            className="flex items-center gap-2 font-semibold text-white"
          >
            <span aria-hidden className="text-emerald-400">
              ৳
            </span>
            Expenditure Tracker
          </NavLink>

          {signedIn ? (
            <nav className="flex items-center gap-1 text-sm">
              {NAV_LINKS.map((link) => (
                <NavLink
                  key={link.to}
                  to={link.to}
                  className={({ isActive }) =>
                    `rounded-md px-3 py-1.5 transition ${
                      isActive ? 'bg-slate-800 text-white' : 'text-slate-400 hover:text-slate-200'
                    }`
                  }
                >
                  {link.label}
                </NavLink>
              ))}
            </nav>
          ) : null}

          <div className="flex items-center gap-3 text-sm">
            {status === 'loading' ? (
              <Spinner label="Checking session" />
            ) : signedIn && user ? (
              <>
                <NavLink
                  to={ROUTES.profile}
                  className={({ isActive }) =>
                    `rounded-md px-3 py-1.5 transition ${
                      isActive ? 'bg-slate-800 text-white' : 'text-slate-400 hover:text-slate-200'
                    }`
                  }
                >
                  {user.name}
                </NavLink>
                <Button variant="ghost" onClick={() => void handleLogout()}>
                  Sign out
                </Button>
              </>
            ) : (
              <>
                <NavLink
                  to={ROUTES.login}
                  className="text-slate-400 transition hover:text-slate-200"
                >
                  Sign in
                </NavLink>
                <NavLink
                  to={ROUTES.register}
                  className="rounded-lg bg-emerald-500 px-3 py-1.5 font-medium text-slate-950 transition hover:bg-emerald-400"
                >
                  Create account
                </NavLink>
              </>
            )}
          </div>
        </div>
      </header>

      <main className="flex-1">
        <Outlet />
      </main>

      <footer className="border-t border-slate-800 px-6 py-6 text-center text-xs text-slate-500">
        Expenditure Tracker · API docs:{' '}
        <a
          className="text-slate-400 underline underline-offset-2"
          href={`${API_BASE_URL}/docs`}
          target="_blank"
          rel="noreferrer"
        >
          {API_BASE_URL}/docs
        </a>
      </footer>
    </div>
  );
}
