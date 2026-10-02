import { Link } from 'react-router-dom';
import { ROUTES } from '../../routes';

export default function NotFoundPage() {
  return (
    <main className="flex w-full flex-col items-start gap-4 px-6 py-24">
      <p className="text-sm font-medium uppercase tracking-wide text-emerald-400">404</p>
      <h1 className="text-3xl font-bold text-white">Page not found</h1>
      <p className="max-w-md text-slate-400">
        The page you are looking for does not exist or has moved.
      </p>
      <Link
        to={ROUTES.home}
        className="rounded-lg bg-emerald-500 px-4 py-2 text-sm font-medium text-slate-950 transition hover:bg-emerald-400"
      >
        Back to home
      </Link>
    </main>
  );
}
