import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ROUTES } from '../../routes';

/** Centred card used by the sign-in / sign-up screens. */
export default function AuthShell({
  title,
  subtitle,
  children,
  footer,
}: {
  title: string;
  subtitle: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <main className="mx-auto flex w-full max-w-md flex-col px-6 py-14">
      <Link
        to={ROUTES.home}
        className="mb-8 self-center text-sm text-slate-400 transition hover:text-slate-200"
      >
        ← Back to home
      </Link>

      <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6 shadow-xl sm:p-8">
        <h1 className="text-2xl font-bold tracking-tight text-white">{title}</h1>
        <p className="mt-1 text-sm text-slate-400">{subtitle}</p>
        <div className="mt-6">{children}</div>
      </div>

      {footer ? <p className="mt-5 text-center text-sm text-slate-400">{footer}</p> : null}
    </main>
  );
}
