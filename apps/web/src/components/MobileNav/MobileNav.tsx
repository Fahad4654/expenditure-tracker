import { NavLink } from 'react-router-dom';
import { ROUTES } from '../../routes';

export default function MobileNav() {
  const getNavClass = ({ isActive }: { isActive: boolean }) =>
    `flex flex-col items-center justify-center gap-1 flex-1 py-1.5 min-h-[50px] text-[10px] font-medium transition-all duration-200 ${
      isActive
        ? 'text-emerald-400 font-semibold'
        : 'text-slate-400 hover:text-slate-200 active:scale-95'
    }`;

  return (
    <nav
      aria-label="Mobile bottom navigation"
      className="fixed bottom-0 left-0 right-0 z-40 flex items-center justify-around border-t border-slate-800/90 bg-slate-950/95 px-2 py-1 backdrop-blur-lg lg:hidden shadow-2xl shadow-emerald-950/20"
    >
      <NavLink to={ROUTES.dashboard} className={getNavClass}>
        {({ isActive }) => (
          <>
            <svg
              className={`h-5 w-5 transition-transform ${isActive ? 'scale-110 stroke-[2.5]' : ''}`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"
              />
            </svg>
            <span>Dashboard</span>
          </>
        )}
      </NavLink>

      <NavLink to={ROUTES.transactions} className={getNavClass}>
        {({ isActive }) => (
          <>
            <svg
              className={`h-5 w-5 transition-transform ${isActive ? 'scale-110 stroke-[2.5]' : ''}`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01"
              />
            </svg>
            <span>Transactions</span>
          </>
        )}
      </NavLink>

      <NavLink
        to={ROUTES.transactionNew}
        className="group relative -top-3 flex flex-col items-center justify-center"
        aria-label="Add transaction"
      >
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-500 text-slate-950 font-bold shadow-lg shadow-emerald-500/30 transition-transform group-active:scale-95 group-hover:bg-emerald-400">
          <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 4v16m8-8H4" />
          </svg>
        </div>
        <span className="mt-0.5 text-[9px] font-semibold text-emerald-400">Add</span>
      </NavLink>

      <NavLink to={ROUTES.reports} className={getNavClass}>
        {({ isActive }) => (
          <>
            <svg
              className={`h-5 w-5 transition-transform ${isActive ? 'scale-110 stroke-[2.5]' : ''}`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
              />
            </svg>
            <span>Reports</span>
          </>
        )}
      </NavLink>

      <NavLink to={ROUTES.categories} className={getNavClass}>
        {({ isActive }) => (
          <>
            <svg
              className={`h-5 w-5 transition-transform ${isActive ? 'scale-110 stroke-[2.5]' : ''}`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a2 2 0 012-2z"
              />
            </svg>
            <span>Categories</span>
          </>
        )}
      </NavLink>

      <NavLink to={ROUTES.profile} className={getNavClass}>
        {({ isActive }) => (
          <>
            <svg
              className={`h-5 w-5 transition-transform ${isActive ? 'scale-110 stroke-[2.5]' : ''}`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
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
