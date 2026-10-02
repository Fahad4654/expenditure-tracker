import { Link, useLocation } from 'react-router-dom';
import { PageHeader, Card, Button } from '../../components/ui';
import { ROUTES } from '../../routes';

const KNOWN: Record<string, { title: string; body: string }> = {
  [ROUTES.verifyPhone]: {
    title: 'Verify your phone',
    body: 'Phone verification codes are sent by SMS, which needs a telephony provider that has not been configured yet.',
  },
};

/**
 * Honest placeholder for routes that exist in the manifest but whose backing
 * service (email / SMS) is not wired up — a 404 here would be misleading.
 */
export default function UnavailablePage() {
  const { pathname } = useLocation();
  const entry = KNOWN[pathname] ?? {
    title: 'Not available yet',
    body: 'This feature is designed but not implemented in the current phase.',
  };

  return (
    <main className="w-full px-6 py-14">
      <PageHeader title={entry.title} subtitle="Not available in this build" />
      <Card>
        <p className="text-sm leading-relaxed text-slate-400">{entry.body}</p>
        <div className="mt-5 flex flex-wrap gap-3">
          <Link to={ROUTES.login}>
            <Button variant="secondary">Back to sign in</Button>
          </Link>
          <Link to={ROUTES.dashboard}>
            <Button variant="ghost">Go to dashboard</Button>
          </Link>
        </div>
      </Card>
    </main>
  );
}
