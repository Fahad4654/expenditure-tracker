import { Outlet } from 'react-router-dom';
import { API_BASE_URL } from '../lib/api';

/**
 * Shell around every page: header, routed content, footer.
 * Phase 3 wraps the protected section in an auth guard at this level.
 */
export default function AppLayout() {
  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-b border-slate-800 bg-slate-950/80 backdrop-blur">
        <div className="mx-auto flex w-full max-w-5xl items-center justify-between px-6 py-4">
          <a href="/" className="flex items-center gap-2 font-semibold text-white">
            <span aria-hidden className="text-emerald-400">
              ৳
            </span>
            Expenditure Tracker
          </a>
          <nav className="text-sm text-slate-400">
            <a
              className="transition hover:text-slate-200"
              href={`${API_BASE_URL}/docs`}
              target="_blank"
              rel="noreferrer"
            >
              API docs
            </a>
          </nav>
        </div>
      </header>

      <main className="flex-1">
        <Outlet />
      </main>

      <footer className="border-t border-slate-800 px-6 py-6 text-center text-xs text-slate-500">
        Expenditure Tracker — Phase 1 scaffold. API docs:{' '}
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
