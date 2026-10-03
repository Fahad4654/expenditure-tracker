import { NavLink } from 'react-router-dom';
import { ROUTES } from '../../routes';

/**
 * Mobile bottom navigation — 4 items symmetrically around a centre FAB.
 * Keeping to 4 + FAB avoids label truncation on any phone width.
 * Categories is reachable via the hamburger sidebar drawer.
 */
export default function MobileNav() {
  const navItemClass = ({ isActive }: { isActive: boolean }) =>
    `flex flex-col items-center justify-center gap-0.5 flex-1 py-2 min-h-[52px] text-[10px] leading-tight font-medium transition-colors duration-150 ${
      isActive
        ? 'text-emerald-400'
        : 'text-slate-500 hover:text-slate-300 active:text-slate-200'
    }`;

  return (
    <nav
      aria-label="Mobile bottom navigation"
      className="fixed bottom-0 left-0 right-0 z-40 flex items-stretch border-t border-slate-800/80 bg-slate-950/96 backdrop-blur-md lg:hidden"
      style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
    >
      {/* Dashboard */}
      <NavLink to={ROUTES.dashboard} className={navItemClass} end>
        {({ isActive }) => (
          <>
            <svg
              className={`h-[22px] w-[22px] shrink-0 ${isActive ? 'stroke-[2.5]' : 'stroke-2'}`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"
              />
            </svg>
            <span>Home</span>
          </>
        )}
      </NavLink>

      {/* Transactions */}
      <NavLink to={ROUTES.transactions} className={navItemClass}>
        {({ isActive }) => (
          <>
            <svg
              className={`h-[22px] w-[22px] shrink-0 ${isActive ? 'stroke-[2.5]' : 'stroke-2'}`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01"
              />
            </svg>
            <span>Txns</span>
          </>
        )}
      </NavLink>

      {/* Centre FAB — Add transaction */}
      <div className="relative flex flex-1 items-center justify-center">
        <NavLink
          to={ROUTES.transactionNew}
          aria-label="Add transaction"
          className="group absolute -top-5 flex flex-col items-center"
        >
          <span className="flex h-14 w-14 items-center justify-center rounded-full bg-emerald-500 shadow-lg shadow-emerald-500/40 transition-all duration-150 group-active:scale-95 group-hover:bg-emerald-400 group-hover:shadow-emerald-400/50">
            <svg className="h-7 w-7 text-slate-950" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 4v16m8-8H4" />
            </svg>
          </span>
          <span className="mt-1 text-[9px] font-semibold text-emerald-400">Add</span>
        </NavLink>
      </div>

      {/* Reports */}
      <NavLink to={ROUTES.reports} className={navItemClass}>
        {({ isActive }) => (
          <>
            <svg
              className={`h-[22px] w-[22px] shrink-0 ${isActive ? 'stroke-[2.5]' : 'stroke-2'}`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
              />
            </svg>
            <span>Reports</span>
          </>
        )}
      </NavLink>

      {/* Profile */}
      <NavLink to={ROUTES.profile} className={navItemClass}>
        {({ isActive }) => (
          <>
            <svg
              className={`h-[22px] w-[22px] shrink-0 ${isActive ? 'stroke-[2.5]' : 'stroke-2'}`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
              />
            </svg>
            <span>Profile</span>
          </>
        )}
      </NavLink>
    </nav>
  );
}
