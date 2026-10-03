import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../../auth/auth-context';
import { ROUTES } from '../../routes';
import { Button } from '../ui';

const NAV_LINKS = [
  { to: ROUTES.dashboard, label: 'Dashboard' },
  { to: ROUTES.transactions, label: 'Transactions' },
  { to: ROUTES.reports, label: 'Reports' },
  { to: ROUTES.categories, label: 'Categories' },
] as const;

const linkClass = ({ isActive }: { isActive: boolean }) =>
  `rounded-md px-3 py-2.5 text-sm transition-colors duration-150 ${
    isActive
      ? 'bg-slate-800 text-white font-semibold'
      : 'text-slate-400 hover:bg-slate-900 hover:text-slate-200'
  }`;

/**
 * Navigation sidebar for the signed-in app shell.
 * - On desktop it lives in a fixed `aside`.
 * - On mobile it is rendered inside a drawer; `onClose` receives the close handler
 *   so the component can render its own header row (logo + ✕ button) without
 *   AppLayout needing a separate duplicate header.
 */
export default function Sidebar({
  onNavigate,
  onClose,
}: {
  onNavigate?: () => void;
  onClose?: () => void;
}) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  async function handleLogout() {
    await logout();
    navigate(ROUTES.home, { replace: true });
  }

  return (
    <div className="flex h-full flex-col gap-6 p-4">
      {/* Logo row — shows a close button when inside the mobile drawer */}
      <div className="flex items-center justify-between px-2 py-1">
        <NavLink
          to={ROUTES.dashboard}
          onClick={onNavigate}
          className="flex items-center gap-2 font-semibold text-white"
        >
          <span aria-hidden className="text-emerald-400">
            ৳
          </span>
          Expenditure Tracker
        </NavLink>

        {onClose ? (
          <button
            type="button"
            aria-label="Close menu"
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-800 hover:text-slate-200 active:scale-95"
          >
            <svg
              aria-hidden
              viewBox="0 0 24 24"
              className="h-5 w-5"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
            >
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        ) : null}
      </div>

      <nav aria-label="Main navigation" className="flex flex-col gap-1 text-sm">
        {NAV_LINKS.map((link) => (
          <NavLink key={link.to} to={link.to} onClick={onNavigate} className={linkClass}>
            {link.label}
          </NavLink>
        ))}
      </nav>

      <div className="mt-auto flex flex-col gap-2 text-sm">
        <NavLink to={ROUTES.profile} onClick={onNavigate} className={linkClass}>
          {user?.name ?? 'Account'}
        </NavLink>
        <Button variant="ghost" className="justify-start" onClick={() => void handleLogout()}>
          Sign out
        </Button>
      </div>
    </div>
  );
}
