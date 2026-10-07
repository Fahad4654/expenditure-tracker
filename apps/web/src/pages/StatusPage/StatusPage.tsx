import { Link } from 'react-router-dom';
import { Card, ErrorBanner, Spinner } from '../../components/ui';
import { useLiveHealth, useReadyHealth } from '../../lib/health';
import { ROUTES } from '../../routes';

/** `83` → `1m 23s`, `4_120` → `1h 8m`. */
function formatUptime(totalSeconds: number): string {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (hours > 0) return `${hours}h ${minutes}m`;
  if (minutes > 0) return `${minutes}m ${seconds}s`;
  return `${seconds}s`;
}

function StatusRow({
  label,
  state,
  detail,
}: {
  label: string;
  state: 'loading' | 'up' | 'down';
  detail?: string;
}) {
  const text = state === 'up' ? 'Operational' : state === 'down' ? 'Unavailable' : 'Checking…';
  const tone =
    state === 'up' ? 'text-emerald-400' : state === 'down' ? 'text-rose-400' : 'text-amber-300';
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 py-4">
      <div>
        <p className="font-medium text-white">{label}</p>
        {detail ? <p className="mt-0.5 text-sm text-slate-500">{detail}</p> : null}
      </div>
      <p className={`inline-flex items-center gap-2 text-sm font-medium ${tone}`}>
        <span
          className={`h-2 w-2 rounded-full ${
            state === 'up' ? 'bg-emerald-400' : state === 'down' ? 'bg-rose-400' : 'bg-amber-400'
          }`}
          aria-hidden
        />
        {text}
      </p>
    </div>
  );
}

/**
 * Public service status — the former homepage "Service Status" card, moved
 * behind its own route. Polls the two unauthenticated health probes; nothing
 * here can reveal user data.
 */
export default function StatusPage() {
  const live = useLiveHealth();
  const ready = useReadyHealth();

  const liveState = live.isPending ? 'loading' : live.isSuccess ? 'up' : 'down';
  const readyState = ready.isPending ? 'loading' : ready.isSuccess ? 'up' : 'down';
  const postgres = ready.data?.checks.postgres;

  return (
    <main className="mx-auto w-full max-w-3xl px-6 py-12">
      <Link to={ROUTES.home} className="text-sm text-slate-400 transition hover:text-slate-200">
        ← Back to home
      </Link>

      <h1 className="mt-6 text-3xl font-bold tracking-tight text-white">Service status</h1>
      <p className="mt-2 text-slate-400">
        Live health checks from the API. Refreshes automatically every 30 seconds.
      </p>

      {live.isError || ready.isError ? (
        <div className="mt-6">
          <ErrorBanner>
            {live.isError
              ? 'The API did not answer the liveness probe — it may be restarting.'
              : 'The API is running, but a dependency is unreachable.'}
          </ErrorBanner>
        </div>
      ) : null}

      <Card className="mt-6 divide-y divide-slate-800 !p-5">
        <StatusRow
          label="API"
          state={liveState}
          detail={
            live.data
              ? `Process up · last response ${new Date(live.data.timestamp).toLocaleTimeString()}`
              : undefined
          }
        />
        <StatusRow
          label="Database"
          state={readyState}
          detail={
            postgres
              ? `PostgreSQL ${postgres.status}${postgres.latencyMs !== undefined ? ` · ${postgres.latencyMs}ms` : ''}`
              : ready.isError
                ? 'PostgreSQL is not reachable'
                : undefined
          }
        />
        <div className="grid gap-4 py-4 sm:grid-cols-2">
          <div>
            <p className="text-sm text-slate-500">Uptime</p>
            <p className="mt-1 font-medium tabular-nums text-slate-200">
              {live.data ? formatUptime(live.data.uptimeSeconds) : '—'}
            </p>
          </div>
          <div>
            <p className="text-sm text-slate-500">Server time</p>
            <p className="mt-1 font-medium tabular-nums text-slate-200">
              {live.data ? new Date(live.data.timestamp).toLocaleString() : '—'}
            </p>
          </div>
        </div>
      </Card>

      {live.isLoading ? (
        <div className="mt-6 flex justify-center">
          <Spinner label="Checking status" />
        </div>
      ) : null}

      <p className="mt-8 text-xs text-slate-600">
        Status reflects the health of the public API only. Individual user dashboards require a
        session and are never shown here.
      </p>
    </main>
  );
}
