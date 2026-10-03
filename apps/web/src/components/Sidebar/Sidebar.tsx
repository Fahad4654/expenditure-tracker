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
  `rounded-md px-3 py-2 transition ${
    isActive
      ? 'bg-slate-800 text-white'
      : 'text-slate-400 hover:bg-slate-900 hover:text-slate-200'
  }`;

/**
 * Navigation sidebar for the signed-in app shell. Only mounted once a session
 * exists, so it always renders the full menu. `onNavigate` lets the mobile
 * drawer close itself after a link is followed.
 */
export default function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  async function handleLogout() {
    await logout();
    navigate(ROUTES.home, { replace: true });
  }

  return (
    <div className="flex h-full flex-col gap-6 p-4">
      <NavLink
        to={ROUTES.dashboard}
        onClick={onNavigate}
        className="flex items-center gap-2 px-2 py-1 font-semibold text-white"
      >
        <span aria-hidden className="text-emerald-400">
          ৳
        </span>
        Expenditure Tracker
      </NavLink>

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
