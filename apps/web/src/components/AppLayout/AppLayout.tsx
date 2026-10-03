import { useEffect, useState } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { API_BASE_URL } from '../../lib/api';
import { useAuth } from '../../auth/auth-context';
import { ROUTES } from '../../routes';
import Sidebar from '../Sidebar/Sidebar';

/**
 * Shell around every page. The homepage keeps its own landing navbar; every
 * other route gets a left sidebar — fixed on large screens, and behind a
 * hamburger drawer on small ones.
 */
export default function AppLayout() {
  const { status } = useAuth();
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
    <div className="min-h-screen">
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-60 border-r border-slate-800 bg-slate-950 lg:block">
        <Sidebar />
      </aside>

      {drawerOpen ? (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button
            type="button"
            aria-label="Close menu"
            className="absolute inset-0 bg-slate-950/70 backdrop-blur-sm"
            onClick={() => setDrawerOpen(false)}
          />
          <div className="absolute inset-y-0 left-0 flex w-64 max-w-[85vw] flex-col border-r border-slate-800 bg-slate-950 shadow-xl">
            <div className="flex justify-end p-3">
              <button
                type="button"
                aria-label="Close menu"
                className="rounded-md p-2 text-slate-400 transition hover:bg-slate-800 hover:text-slate-200"
                onClick={() => setDrawerOpen(false)}
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
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto">
              <Sidebar onNavigate={() => setDrawerOpen(false)} />
            </div>
          </div>
        </div>
      ) : null}

      <div className="flex min-h-screen flex-col lg:pl-60">
        <header className="sticky top-0 z-30 flex items-center gap-3 border-b border-slate-800 bg-slate-950/80 px-4 py-3 backdrop-blur lg:hidden">
          <button
            type="button"
            aria-label="Open menu"
            aria-expanded={drawerOpen}
            className="rounded-md p-2 text-slate-400 transition hover:bg-slate-800 hover:text-slate-200"
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
            to={signedIn ? ROUTES.dashboard : ROUTES.home}
            className="flex items-center gap-2 font-semibold text-white"
          >
            <span aria-hidden className="text-emerald-400">
              ৳
            </span>
            Expenditure Tracker
          </NavLink>
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
    </div>
  );
}
