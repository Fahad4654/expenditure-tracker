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
    <main className="mx-auto flex w-full max-w-md flex-col px-4 sm:px-6 py-6 sm:py-12">
      <Link
        to={ROUTES.home}
        className="mb-6 self-center text-xs sm:text-sm font-medium text-slate-400 transition hover:text-slate-200"
      >
        ← Back to home
      </Link>

      <div className="rounded-2xl border border-slate-800/80 bg-slate-900/60 p-5 sm:p-8 shadow-2xl backdrop-blur-sm">
        <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-white">{title}</h1>
        <p className="mt-1 text-xs sm:text-sm text-slate-400">{subtitle}</p>
        <div className="mt-5 sm:mt-6">{children}</div>
      </div>

      {footer ? (
        <p className="mt-5 text-center text-xs sm:text-sm text-slate-400">{footer}</p>
      ) : null}
    </main>
  );
}
