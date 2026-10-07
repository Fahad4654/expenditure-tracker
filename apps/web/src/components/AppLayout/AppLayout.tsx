import { useEffect, useState } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '../../auth/auth-context';
import { ROUTES } from '../../routes';
import Sidebar from '../Sidebar/Sidebar';
import MobileNav from '../MobileNav/MobileNav';

/**
 * Shell around every page. The homepage keeps its own landing navbar. Every
 * other route gets a left sidebar — fixed on large screens, behind a
 * hamburger drawer on small ones — but only after sign-in; guests see a
 * brand-only header with no menu.
 */
export default function AppLayout() {
  const { status, user } = useAuth();
  const signedIn = status === 'authenticated';
  const [drawerOpen, setDrawerOpen] = useState(false);

  useEffect(() => {
    if (!drawerOpen) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setDrawerOpen(false);
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [drawerOpen]);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      {signedIn ? (
        <aside className="fixed inset-y-0 left-0 z-40 hidden w-60 border-r border-slate-800/80 bg-slate-950 lg:block">
          <Sidebar />
        </aside>
      ) : null}

      {signedIn && drawerOpen ? (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button
            type="button"
            aria-label="Close menu"
            className="absolute inset-0 bg-slate-950/80 backdrop-blur-md"
            onClick={() => setDrawerOpen(false)}
          />
          <div className="absolute inset-y-0 left-0 flex w-72 max-w-[85vw] flex-col border-r border-slate-800/80 bg-slate-950 shadow-2xl">
            <div className="min-h-0 flex-1 overflow-y-auto">
              <Sidebar
                onNavigate={() => setDrawerOpen(false)}
                onClose={() => setDrawerOpen(false)}
              />
            </div>
          </div>
        </div>
      ) : null}

      <div className={`flex min-h-screen flex-col ${signedIn ? 'lg:pl-60 pb-20 lg:pb-0' : ''}`}>
        {signedIn ? (
          <header className="sticky top-0 z-30 flex items-center justify-between gap-3 border-b border-slate-800/80 bg-slate-950/90 px-4 py-3 backdrop-blur-md lg:hidden">
            <div className="flex items-center gap-3">
              <button
                type="button"
                aria-label="Open menu"
                aria-expanded={drawerOpen}
                className="rounded-lg p-2 text-slate-400 transition hover:bg-slate-800 hover:text-slate-200 active:scale-95"
                onClick={() => setDrawerOpen(true)}
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
                  <path d="M4 7h16M4 12h16M4 17h16" />
                </svg>
              </button>

              <NavLink
                to={ROUTES.dashboard}
                className="flex items-center gap-2 font-semibold text-white"
              >
                <span aria-hidden className="text-emerald-400">
                  ৳
                </span>
                Expenditure Tracker
              </NavLink>
            </div>

            {user ? (
              <NavLink
                to={ROUTES.profile}
                className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-800 text-xs font-bold text-emerald-400 border border-slate-700 hover:border-emerald-500 transition"
                aria-label="User profile"
              >
                {user.name.charAt(0).toUpperCase()}
              </NavLink>
            ) : null}
          </header>
        ) : (
          <header className="border-b border-slate-800/80 bg-slate-950/90 px-4 sm:px-6 py-4 backdrop-blur-md">
            <NavLink to={ROUTES.home} className="flex items-center gap-2 font-semibold text-white">
              <span aria-hidden className="text-emerald-400">
                ৳
              </span>
              Expenditure Tracker
            </NavLink>
          </header>
        )}

        <main className="flex-1 w-full">
          <Outlet />
        </main>

        <footer className="border-t border-slate-800/80 px-4 sm:px-6 py-6 text-center text-xs text-slate-500">
          © {new Date().getFullYear()} Expenditure Tracker. All rights reserved.
        </footer>

        {signedIn ? <MobileNav /> : null}
      </div>
    </div>
  );
}
