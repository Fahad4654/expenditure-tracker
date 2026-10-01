import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../auth/auth-context';
import { API_BASE_URL } from '../../lib/api';
import { ROUTES } from '../../routes';

interface HealthPayload {
  status: string;
  uptimeSeconds: number;
  timestamp: string;
}

type HealthState =
  { phase: 'loading' } | { phase: 'down' } | { phase: 'up'; payload: HealthPayload };

const FEATURES = [
  {
    title: 'Fast transaction entry',
    body: 'Add an expense in seconds — type, amount, category, title, date, save.',
  },
  {
    title: 'Offline-first mobile',
    body: 'The Flutter app writes to SQLite first and synchronises when you are back online.',
  },
  {
    title: 'Idempotent sync',
    body: 'Client-generated UUIDs and an operation log make replaying changes safe.',
  },
  {
    title: 'Accurate money',
    body: 'PostgreSQL Decimal(18,2) end to end — never floating point.',
  },
] as const;

async function fetchApiHealth(): Promise<HealthState> {
  try {
    const response = await fetch(`${API_BASE_URL}/api/v1/health/live`, {
      cache: 'no-store',
      signal: AbortSignal.timeout(4000),
    });
    if (!response.ok) return { phase: 'down' };
    const body = (await response.json()) as { ok: boolean; data: HealthPayload };
    return body.ok ? { phase: 'up', payload: body.data } : { phase: 'down' };
  } catch {
    return { phase: 'down' };
  }
}

export default function HomePage() {
  const { status } = useAuth();
  const signedIn = status === 'authenticated';
  const [health, setHealth] = useState<HealthState>({ phase: 'loading' });

  useEffect(() => {
    let active = true;
    void fetchApiHealth().then((result) => {
      if (active) setHealth(result);
    });
    return () => {
      active = false;
    };
  }, []);

  const isUp = health.phase === 'up';

  return (
    <main className="mx-auto w-full max-w-5xl px-6 py-14">
      <header className="flex flex-col gap-3">
        <span className="inline-flex w-fit items-center gap-2 rounded-full border border-slate-700 bg-slate-900 px-3 py-1 text-xs text-slate-300">
          <span
            className={`h-2 w-2 rounded-full ${
              health.phase === 'loading' ? 'bg-amber-400' : isUp ? 'bg-emerald-400' : 'bg-rose-400'
            }`}
            aria-hidden
          />
          API {health.phase === 'loading' ? 'checking' : isUp ? 'connected' : 'unreachable'} ·{' '}
          <code className="text-slate-400">{API_BASE_URL}</code>
        </span>

        <h1 className="text-4xl font-bold tracking-tight text-white sm:text-5xl">
          Expenditure Tracker
        </h1>
        <p className="max-w-2xl text-slate-400">
          A personal income and expense tracker with a React + Vite web app, a Flutter mobile app
          and a single NestJS API — designed offline-first from day one.
        </p>

        <div className="flex flex-wrap gap-3 pt-2">
          <a
            href={`${API_BASE_URL}/docs`}
            target="_blank"
            rel="noreferrer"
            className="rounded-lg bg-emerald-500 px-4 py-2 text-sm font-medium text-slate-950 transition hover:bg-emerald-400"
          >
            API documentation
          </a>
          {signedIn ? (
            <Link
              to={ROUTES.dashboard}
              className="rounded-lg border border-slate-700 px-4 py-2 text-sm text-slate-300 transition hover:bg-slate-800"
            >
              Open dashboard
            </Link>
          ) : (
            <>
              <Link
                to={ROUTES.login}
                className="rounded-lg border border-slate-700 px-4 py-2 text-sm text-slate-300 transition hover:bg-slate-800"
              >
                Sign in
              </Link>
              <Link
                to={ROUTES.register}
                className="rounded-lg border border-slate-700 px-4 py-2 text-sm text-slate-300 transition hover:bg-slate-800"
              >
                Create account
              </Link>
            </>
          )}
        </div>
      </header>

      <section className="mt-14 grid gap-4 sm:grid-cols-2">
        {FEATURES.map((feature) => (
          <article
            key={feature.title}
            className="rounded-xl border border-slate-800 bg-slate-900/60 p-5"
          >
            <h2 className="font-semibold text-white">{feature.title}</h2>
            <p className="mt-1 text-sm leading-relaxed text-slate-400">{feature.body}</p>
          </article>
        ))}
      </section>

      <section className="mt-12 rounded-xl border border-slate-800 bg-slate-900/40 p-5">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-400">
          Service status
        </h2>
        <dl className="mt-3 grid gap-3 text-sm sm:grid-cols-3">
          <div>
            <dt className="text-slate-500">API</dt>
            <dd className={isUp ? 'text-emerald-400' : 'text-rose-400'}>
              {health.phase === 'loading' ? 'Checking…' : isUp ? 'Healthy' : 'Down'}
            </dd>
          </div>
          <div>
            <dt className="text-slate-500">Uptime</dt>
            <dd className="text-slate-200">
              {health.phase === 'up' ? `${health.payload.uptimeSeconds}s` : '—'}
            </dd>
          </div>
          <div>
            <dt className="text-slate-500">Server time</dt>
            <dd className="text-slate-200">
              {health.phase === 'up' ? new Date(health.payload.timestamp).toISOString() : '—'}
            </dd>
          </div>
        </dl>
      </section>
    </main>
  );
}
